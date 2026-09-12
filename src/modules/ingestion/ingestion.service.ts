import { Readable } from "node:stream";
import path from "node:path";
import sharp from "sharp";
import { logger } from "../../config/logger.js";
import { MangaDexClient } from "./mangadex.client.js";
import { IngestionRepository } from "./ingestion.repository.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { ChapterMapper } from "./chapter-mapper.js";
import type { MangaPlan, VolumePlan } from "./ingestion.types.js";
import { AppError } from "../../shared/errors/AppError.js";

export class IngestionService {
  constructor(
    private mangadex: MangaDexClient,
    private repo: IngestionRepository,
    private storage: CloudStorageService
  ) {}

  /**
   * Generates a MangaPlan and DryRunSummary without downloading/uploading images
   */
  async analyze(mangaIdOrUrlOrTitle: string) {
    let externalId: string;
    try {
      externalId = MangaDexClient.extractMangaId(mangaIdOrUrlOrTitle);
    } catch {
      logger.info(`[Ingestor] Buscando en MangaDex por título: "${mangaIdOrUrlOrTitle}"...`);
      const matched = await this.mangadex.searchMangaByTitle(mangaIdOrUrlOrTitle);
      if (!matched) {
        throw new Error(`No se encontró ningún manga en MangaDex con el término: "${mangaIdOrUrlOrTitle}"`);
      }
      externalId = matched.id;
    }

    logger.info(`[Ingestor] Consultando metadatos para ID: ${externalId}...`);
    const mangaData = await this.mangadex.getManga(externalId);

    logger.info(`[Ingestor] Consultando mapa canónico en MangaDex (/aggregate)...`);
    const aggregateEn = await this.mangadex.getAggregate(externalId, "en");

    logger.info(`[Ingestor] Consultando capítulos disponibles (ES / EN)...`);
    const allChapters = await this.mangadex.getChapters(externalId, ["es", "es-la", "en"]);

    logger.info(`[Ingestor] Evaluando disponibilidad híbrida tomo a tomo...`);
    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregateEn, allChapters);
    const summary = ChapterMapper.toDryRunSummary(plan);

    return { plan, summary };
  }

  /**
   * Ingests or updates a manga with hybrid fallback directly into R2 and DB
   */
  async ingest(
    mangaIdOrUrlOrTitle: string,
    options?: {
      force?: boolean;
      onProgress?: (progress: {
        step: string;
        currentVolume?: number;
        totalVolumes?: number;
        currentPage?: number;
        totalPages?: number;
      }) => void;
    }
  ) {
    const { plan } = await this.analyze(mangaIdOrUrlOrTitle);

    if (plan.volumes.length === 0) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        statusCode: 400,
        message: `No se puede importar el manga "${plan.title}" porque no cuenta con los primeros volúmenes disponibles (Tomo 1 en adelante de forma continua).`,
      });
    }

    const notify = options?.onProgress || (() => {});

    notify({ step: `Iniciando ingesta de "${plan.title}" (${plan.volumes.length} tomos)...` });

    // 1. Create or Find Manga record in DB
    let manga = await this.repo.findMangaByExternalId(plan.externalId);
    if (!manga) {
      manga = await this.repo.findMangaByTitle(plan.title);
    }

    if (!manga) {
      manga = await this.repo.createManga({
        title: plan.title,
        titleKanji: plan.titleKanji,
        author: plan.author,
        description: plan.description,
        status: plan.status,
      });
      logger.info(`[Ingestor] Manga creado en BD: "${manga.title}" (ID: ${manga.id})`);
    } else {
      logger.info(`[Ingestor] Manga ya existe en BD: "${manga.title}" (ID: ${manga.id}). Actualizando metadatos y rellenando tomos nuevos...`);
      await this.repo.updateMangaMetadata(manga.id, {
        author: plan.author ?? manga.author,
        description: plan.description ?? manga.description,
        titleKanji: plan.titleKanji ?? manga.titleKanji,
        status: plan.status,
      });
    }

    // 2. Sync Genre & Demographic Tags
    if (plan.tags && plan.tags.length > 0) {
      await this.repo.syncMangaTags(manga.id, plan.tags);
      logger.info(`[Ingestor] Etiquetas sincronizadas para "${manga.title}": [${plan.tags.join(", ")}]`);
    }

    // 3. Upload Manga Cover if available and not yet set
    if (plan.coverFileName && !manga.coverPath) {
      notify({ step: `Descargando portada oficial...` });
      try {
        const coverUrl = `https://uploads.mangadex.org/covers/${plan.externalId}/${plan.coverFileName}.512.jpg`;
        const coverBuffer = await this.mangadex.downloadImageBuffer(coverUrl);

        const webpCover = await sharp(coverBuffer)
          .resize({ width: 600, withoutEnlargement: true })
          .webp({ quality: 75, effort: 4 })
          .toBuffer();

        const destCover = this.storage.resolveMangaCoverPath(manga.id, ".webp");
        const relativeCover = path.posix.join("manga", manga.id, "cover", "cover.webp");

        await this.storage.saveStream(Readable.from(webpCover), destCover);
        await this.repo.updateMangaCover(manga.id, relativeCover);
        logger.info(`[Ingestor] Portada subida a R2: ${relativeCover}`);
      } catch (err) {
        logger.warn(`[Ingestor] No se pudo procesar la portada: ${(err as Error).message}`);
      }
    }

    // 4. Process / Backfill Volumes
    for (const [i, volPlan] of plan.volumes.entries()) {
      const volIndex = i + 1;

      notify({
        step: `Procesando Tomo ${volPlan.volumeNumber} (${volPlan.language}${volPlan.isFallback ? " - Fallback" : ""})...`,
        currentVolume: volIndex,
        totalVolumes: plan.volumes.length,
      });

      await this.processVolume(manga.id, volPlan, plan.externalId, notify, options);
    }

    // 5. Register in Tracker
    const trackerStatus = plan.isFullySpanish ? "COMPLETED" : "HYBRID";
    await this.repo.upsertTracker({
      mangaId: manga.id,
      externalMangaId: plan.externalId,
      status: trackerStatus,
      pendingSpanishVols: plan.pendingSpanishVols,
    });

    notify({
      step: `Ingesta/Actualización completada con éxito. Estado: ${trackerStatus}.`,
      totalVolumes: plan.volumes.length,
    });

    return {
      mangaId: manga.id,
      title: manga.title,
      totalVolumes: plan.volumes.length,
      status: trackerStatus,
      pendingSpanishVols: plan.pendingSpanishVols,
    };
  }

  /**
   * Processes a single volume: downloads chapters, converts to WebP, uploads to R2, saves DB pages
   */
  async processVolume(
    mangaId: string,
    volPlan: VolumePlan,
    externalMangaId: string,
    notify?: (progress: any) => void,
    options?: { force?: boolean }
  ) {
    // 1. Find or create volume in DB
    let volume = await this.repo.findVolumeByMangaAndNumber(mangaId, volPlan.volumeNumber);
    if (!volume) {
      volume = await this.repo.createVolume({
        mangaId,
        number: volPlan.volumeNumber,
        title: volPlan.volumeTitle,
        status: "UPLOADING",
        pagesCount: 0,
        language: volPlan.language,
        isFallback: volPlan.isFallback,
      });
    } else if (
      volume.status === "READY" &&
      volume.pagesCount > 0 &&
      volume.language === volPlan.language &&
      volume.isFallback === volPlan.isFallback &&
      !options?.force
    ) {
      logger.info(
        `[Ingestor] Tomo ${volPlan.volumeNumber} ya está listo en BD (${volume.pagesCount} páginas). Omitiendo re-descarga.`
      );
      return;
    }

    // 2. Fetch page list from MangaDex@Home for all chapters in this volume
    const pageUrls: string[] = [];
    for (const ch of volPlan.chapters) {
      try {
        const atHome = await this.mangadex.getAtHomeServer(ch.id);
        const baseUrl = atHome.baseUrl;
        const hash = atHome.chapter.hash;
        // Use standard data quality
        for (const filename of atHome.chapter.data) {
          pageUrls.push(`${baseUrl}/data/${hash}/${filename}`);
        }
      } catch (err) {
        logger.error({ err }, `[Ingestor] Error obteniendo páginas del capítulo ${ch.chapterNumber}: ${(err as Error).message}`);
      }
    }

    if (pageUrls.length === 0) {
      logger.warn(`[Ingestor] Tomo ${volPlan.volumeNumber} no tiene páginas disponibles. Saltando...`);
      return;
    }

    logger.info(
      `[Ingestor] Tomo ${volPlan.volumeNumber}: Descargando y procesando ${pageUrls.length} páginas...`
    );

    // 3. Process & Upload pages with concurrency limit
    const CONCURRENCY = 4;
    const dbPages: Array<{ index: number; filename: string }> = [];
    let firstPageBuffer: Buffer | null = null;

    for (let p = 0; p < pageUrls.length; p += CONCURRENCY) {
      const batchUrls = pageUrls.slice(p, p + CONCURRENCY);
      const batchPromises = batchUrls.map(async (url, offset) => {
        const pageIndex = p + offset + 1;
        const filename = `${String(pageIndex).padStart(3, "0")}.webp`;
        const destKey = this.storage.resolveMangaPagePath(mangaId, volume.id, filename);

        // Download
        const rawBuffer = await this.mangadex.downloadImageBuffer(url);

        // Sharp WebP conversion in memory
        const webpBuffer = await sharp(rawBuffer)
          .resize({ width: 1000, withoutEnlargement: true })
          .webp({ quality: 75, effort: 4 })
          .toBuffer();

        if (pageIndex === 1) {
          firstPageBuffer = webpBuffer;
        }

        // Upload to Cloudflare R2
        await this.storage.saveStream(Readable.from(webpBuffer), destKey);

        return { index: pageIndex, filename };
      });

      const processedBatch = await Promise.all(batchPromises);
      dbPages.push(...processedBatch);

      notify?.({
        step: `Tomo ${volPlan.volumeNumber}: ${dbPages.length}/${pageUrls.length} páginas`,
        currentPage: dbPages.length,
        totalPages: pageUrls.length,
      });
    }

    // 4. If volume has no cover, use first page as cover
    let volumeCoverRelative: string | undefined = undefined;
    if (firstPageBuffer) {
      try {
        const volCoverDest = this.storage.resolveVolumeCoverPath(mangaId, volume.id, ".webp");
        volumeCoverRelative = path.posix.join("manga", mangaId, "volumes", volume.id, "cover", "cover.webp");
        await this.storage.saveStream(Readable.from(firstPageBuffer), volCoverDest);
      } catch (err) {
        logger.warn(`[Ingestor] No se pudo guardar portada de tomo: ${(err as Error).message}`);
      }
    }

    // 5. Update DB Pages and Volume status
    await this.repo.deletePagesByVolumeId(volume.id);
    await this.repo.createPages(volume.id, dbPages);
    await this.repo.updateVolume(volume.id, {
      status: "READY",
      pagesCount: dbPages.length,
      language: volPlan.language,
      isFallback: volPlan.isFallback,
      ...(volumeCoverRelative ? { coverPath: volumeCoverRelative } : {}),
    });

    logger.info(`[Ingestor] Tomo ${volPlan.volumeNumber} completado (${dbPages.length} páginas subidas).`);
  }
}
