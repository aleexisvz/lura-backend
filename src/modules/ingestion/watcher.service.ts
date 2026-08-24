import { MangaDexClient } from "./mangadex.client.js";
import { IngestionRepository } from "./ingestion.repository.js";
import { IngestionService } from "./ingestion.service.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { ChapterMapper } from "./chapter-mapper.js";

export class WatcherService {
  constructor(
    private mangadex: MangaDexClient,
    private repo: IngestionRepository,
    private ingestionService: IngestionService,
    private storage: CloudStorageService
  ) {}

  /**
   * Scans and audits all tracked mangas:
   * 1. Audits existing DB records to purge orphan/non-contiguous volumes and invalid non-starting mangas from R2 and DB.
   * 2. Checks MangaDex for newly released sequential volumes and downloads them.
   * 3. Patches fallback volumes to Spanish as translations appear.
   */
  async checkAndPatch() {
    console.log("[Watcher] Iniciando auditoría y revisión de mangas (limpieza de tomos huérfanos, nuevos tomos y traducciones pendientes)...");
    const allTrackers = await this.repo.findAllTrackers();

    if (allTrackers.length === 0) {
      console.log("[Watcher] No hay mangas en seguimiento que requieran revisión.");
      return {
        checkedTrackers: 0,
        actions: [],
        patchedVolumes: [],
      };
    }

    console.log(`[Watcher] ${allTrackers.length} manga(s) encontrados en seguimiento.`);
    const actions: Array<{
      mangaTitle: string;
      mangaId: string;
      volumeNumber?: number;
      type: "DELETED_INVALID_MANGA" | "DELETED_DISCONNECTED_VOLUME" | "NEW_VOLUME" | "SPANISH_PATCH";
    }> = [];

    for (const tracker of allTrackers) {
      const rawDbVolumes = tracker.Manga.volumes || [];
      const dbVolumes = [...rawDbVolumes].sort((a, b) => a.number - b.number);

      console.log(
        `[Watcher] Auditando "${tracker.Manga.title}" (Tomos en BD: [${dbVolumes.map((v) => v.number).join(", ")}], Pendientes: [${tracker.pendingSpanishVols.join(", ")}])...`
      );

      try {
        // --- FASE 1: AUDITORÍA DE CONSISTENCIA LOCAL ---
        // 1.1 Si el manga no tiene Tomo 1 (por ejemplo, sólo tiene 2-3-4 o 5-21-25)
        if (dbVolumes.length === 0 || dbVolumes[0]!.number !== 1) {
          console.warn(
            `[Watcher:Audit] ⚠️ El manga "${tracker.Manga.title}" no cuenta con el Tomo 1 en BD. Eliminando manga y purgando almacenamiento R2...`
          );

          await this.storage.deleteMangaFiles(tracker.mangaId);
          await this.repo.deleteManga(tracker.mangaId);

          actions.push({
            mangaTitle: tracker.Manga.title,
            mangaId: tracker.mangaId,
            type: "DELETED_INVALID_MANGA",
          });
          continue; // Pasamos al siguiente manga
        }

        // 1.2 Si el manga tiene huecos (por ejemplo, 1, 2, 5, 19)
        const validPrefix: typeof dbVolumes = [];
        const invalidVolumes: typeof dbVolumes = [];
        let expectedNum = 1;

        for (const vol of dbVolumes) {
          if (vol.number === expectedNum) {
            validPrefix.push(vol);
            expectedNum++;
          } else {
            invalidVolumes.push(vol);
          }
        }

        if (invalidVolumes.length > 0) {
          for (const invVol of invalidVolumes) {
            console.warn(
              `[Watcher:Audit] 🗑️ Purgando tomo desconectado: Tomo ${invVol.number} de "${tracker.Manga.title}" (R2 y BD)...`
            );

            await this.storage.deleteVolumeFiles(tracker.mangaId, invVol.id);
            await this.repo.deleteVolume(invVol.id);

            actions.push({
              mangaTitle: tracker.Manga.title,
              mangaId: tracker.mangaId,
              volumeNumber: invVol.number,
              type: "DELETED_DISCONNECTED_VOLUME",
            });
          }
        }

        const currentVolumes = validPrefix;
        const maxDbVolumeNumber = currentVolumes.reduce((max: number, v: { number: number }) => Math.max(max, v.number), 0);

        // --- FASE 2: SINCRONIZACIÓN CON MANGADEX ---
        const mangaData = await this.mangadex.getManga(tracker.externalMangaId);
        const aggregateEn = await this.mangadex.getAggregate(tracker.externalMangaId, "en");
        const allChapters = await this.mangadex.getChapters(tracker.externalMangaId, ["es", "es-la", "en"]);

        const updatedPlan = ChapterMapper.buildMangaPlan(mangaData, aggregateEn, allChapters);

        // 2.1 Descargar nuevos tomos continuos disponibles
        for (const volPlan of updatedPlan.volumes) {
          if (volPlan.volumeNumber > maxDbVolumeNumber) {
            console.log(
              `[Watcher] 📥 Nuevo tomo contiguo disponible: Tomo ${volPlan.volumeNumber} para "${tracker.Manga.title}". Descargando...`
            );

            await this.ingestionService.processVolume(
              tracker.mangaId,
              volPlan,
              tracker.externalMangaId
            );

            actions.push({
              mangaTitle: tracker.Manga.title,
              mangaId: tracker.mangaId,
              volumeNumber: volPlan.volumeNumber,
              type: "NEW_VOLUME",
            });
          }
        }

        // 2.2 Parchado a Español de tomos de fallback existentes
        for (const pendingVolNum of tracker.pendingSpanishVols) {
          if (pendingVolNum <= maxDbVolumeNumber) {
            const volPlan = updatedPlan.volumes.find((v) => v.volumeNumber === pendingVolNum);

            // If it's now 100% available in Spanish
            if (volPlan && volPlan.language === "ES" && !volPlan.isFallback) {
              console.log(
                `[Watcher] 🚀 ¡Tomo ${pendingVolNum} de "${tracker.Manga.title}" ya está completo en Español! Parchando...`
              );

              await this.ingestionService.processVolume(
                tracker.mangaId,
                volPlan,
                tracker.externalMangaId,
                undefined,
                { force: true }
              );

              const existingVol = await this.repo.findVolumeByMangaAndNumber(
                tracker.mangaId,
                pendingVolNum
              );
              if (existingVol) {
                await this.repo.updateVolume(existingVol.id, {
                  version: (existingVol.version || 1) + 1,
                });
                await this.repo.clampReadingProgress(existingVol.id, existingVol.pagesCount);
              }

              actions.push({
                mangaTitle: tracker.Manga.title,
                mangaId: tracker.mangaId,
                volumeNumber: pendingVolNum,
                type: "SPANISH_PATCH",
              });
            }
          }
        }

        // 2.3 Actualizar metadatos de manga y estado del tracker
        await this.repo.updateMangaMetadata(tracker.mangaId, {
          status: updatedPlan.status,
          author: updatedPlan.author,
          description: updatedPlan.description,
          titleKanji: updatedPlan.titleKanji,
        });

        const isComplete = updatedPlan.pendingSpanishVols.length === 0;
        await this.repo.updateTrackerStatus(tracker.id, {
          status: isComplete ? "COMPLETED" : "HYBRID",
          pendingSpanishVols: updatedPlan.pendingSpanishVols,
        });

        if (isComplete) {
          console.log(`[Watcher] 🎉 "${tracker.Manga.title}" está 100% en Español.`);
        }
      } catch (err) {
        console.error(
          `[Watcher] Error procesando manga "${tracker.Manga.title}": ${(err as Error).message}`
        );
      }
    }

    console.log(
      `[Watcher] Finalizado. ${actions.length} acción(es) realizadas.`
    );

    return {
      checkedTrackers: allTrackers.length,
      actions,
      patchedVolumes: actions,
    };
  }
}
