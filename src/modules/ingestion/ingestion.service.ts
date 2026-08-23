import { Readable } from "node:stream";
import path from "node:path";
import sharp from "sharp";
import { MangaDexClient } from "./mangadex.client.js";
import { IngestionRepository } from "./ingestion.repository.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { ChapterMapper } from "./chapter-mapper.js";
import type { MangaPlan, VolumePlan } from "./ingestion.types.js";

export class IngestionService {
  constructor(
    private mangadex: MangaDexClient,
    private repo: IngestionRepository,
    private storage: CloudStorageService
  ) {}

  /**
   * Generates a MangaPlan and DryRunSummary without downloading/uploading images
   */
  async analyze(mangaIdOrUrl: string) {
    const externalId = MangaDexClient.extractMangaId(mangaIdOrUrl);

    console.log(`[Ingestor] Consultando metadatos para ID: ${externalId}...`);
    const mangaData = await this.mangadex.getManga(externalId);

    console.log(`[Ingestor] Consultando mapa canónico en MangaDex (/aggregate)...`);
    const aggregateEn = await this.mangadex.getAggregate(externalId, "en");

    console.log(`[Ingestor] Consultando capítulos disponibles (ES / EN)...`);
    const allChapters = await this.mangadex.getChapters(externalId, ["es", "es-la", "en"]);

    console.log(`[Ingestor] Evaluando disponibilidad híbrida tomo a tomo...`);
    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregateEn, allChapters);
    const summary = ChapterMapper.toDryRunSummary(plan);

    return { plan, summary };
  }

  /**
   * Ingests a complete manga with hybrid fallback directly into R2 and DB
   */
  async ingest(
    mangaIdOrUrl: string,
    options?: {
      onProgress?: (progress: {
        step: string;
        currentVolume?: number;
        totalVolumes?: number;
        currentPage?: number;
        totalPages?: number;
      }) => void;
    }
  ) {
    const { plan } = await this.analyze(mangaIdOrUrl);
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
      console.log(`[Ingestor] Manga creado en BD: "${manga.title}" (ID: ${manga.id})`);
    } else {
      console.log(`[Ingestor] Manga ya existe en BD: "${manga.title}" (ID: ${manga.id})`);
    }

    // 2. Sync Genre & Demographic Tags
    if (plan.tags && plan.tags.length > 0) {
      await this.repo.syncMangaTags(manga.id, plan.tags);
      console.log(`[Ingestor] Etiquetas sincronizadas para "${manga.title}": [${plan.tags.join(", ")}]`);
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
        console.log(`[Ingestor] Portada subida a R2: ${relativeCover}`);
      } catch (err) {
        console.warn(`[Ingestor] No se pudo procesar la portada: ${(err as Error).message}`);
      }
    }

    // 3. Process Volumes
    for (const [i, volPlan] of plan.volumes.entries()) {
      const volIndex = i + 1;

      notify({
        step: `Procesando Tomo ${volPlan.volumeNumber} (${volPlan.language}${volPlan.isFallback ? " - Fallback" : ""})...`,
        currentVolume: volIndex,
        totalVolumes: plan.volumes.length,
      });

      await this.processVolume(manga.id, volPlan, plan.externalId, notify);
    }

    // 4. Register in Tracker
    const trackerStatus = plan.isFullySpanish ? "COMPLETED" : "HYBRID";
    await this.repo.upsertTracker({
      mangaId: manga.id,
      externalMangaId: plan.externalId,
      status: trackerStatus,
      pendingSpanishVols: plan.pendingSpanishVols,
    });

    notify({
      step: `Ingesta completada con éxito. Estado: ${trackerStatus}.`,
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
    notify?: (progress: any) => void
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
        console.error(`[Ingestor] Error obteniendo páginas del capítulo ${ch.chapterNumber}: ${(err as Error).message}`);
      }
    }

    if (pageUrls.length === 0) {
      console.warn(`[Ingestor] Tomo ${volPlan.volumeNumber} no tiene páginas disponibles. Saltando...`);
      return;
    }

    console.log(
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
        console.warn(`[Ingestor] No se pudo guardar portada de tomo: ${(err as Error).message}`);
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

    console.log(`[Ingestor] Tomo ${volPlan.volumeNumber} completado (${dbPages.length} páginas subidas).`);
  }
}
