import { MangaDexClient } from "./mangadex.client.js";
import { IngestionRepository } from "./ingestion.repository.js";
import { IngestionService } from "./ingestion.service.js";
import { ChapterMapper } from "./chapter-mapper.js";

export class WatcherService {
  constructor(
    private mangadex: MangaDexClient,
    private repo: IngestionRepository,
    private ingestionService: IngestionService
  ) {}

  /**
   * Scans all tracked mangas with pending Spanish volumes and patches them when translations emerge
   */
  async checkAndPatch() {
    console.log("[Watcher] Iniciando revisión de mangas con traducciones pendientes...");
    const hybridTrackers = await this.repo.findHybridTrackers();

    if (hybridTrackers.length === 0) {
      console.log("[Watcher] No hay mangas en estado HYBRID con tomos pendientes.");
      return {
        checkedTrackers: 0,
        patchedVolumes: [],
      };
    }

    console.log(`[Watcher] ${hybridTrackers.length} manga(s) encontrados en seguimiento.`);
    const patchedVolumes: Array<{
      mangaTitle: string;
      mangaId: string;
      volumeNumber: number;
    }> = [];

    for (const tracker of hybridTrackers) {
      console.log(
        `[Watcher] Verificando "${tracker.Manga.title}" (Tomos pendientes: [${tracker.pendingSpanishVols.join(", ")}])...`
      );

      try {
        const mangaData = await this.mangadex.getManga(tracker.externalMangaId);
        const aggregateEn = await this.mangadex.getAggregate(tracker.externalMangaId, "en");
        const allChapters = await this.mangadex.getChapters(tracker.externalMangaId, ["es", "es-la", "en"]);

        const updatedPlan = ChapterMapper.buildMangaPlan(mangaData, aggregateEn, allChapters);

        const remainingPending: number[] = [];

        for (const pendingVolNum of tracker.pendingSpanishVols) {
          const volPlan = updatedPlan.volumes.find((v) => v.volumeNumber === pendingVolNum);

          // If it's now 100% available in Spanish
          if (volPlan && volPlan.language === "ES" && !volPlan.isFallback) {
            console.log(
              `[Watcher] 🚀 ¡Tomo ${pendingVolNum} de "${tracker.Manga.title}" ya está completo en Español! Parchando...`
            );

            // Re-process and overwrite English pages with Spanish pages
            await this.ingestionService.processVolume(
              tracker.mangaId,
              volPlan,
              tracker.externalMangaId
            );

            // Fetch current volume to bump version
            const existingVol = await this.repo.findVolumeByMangaAndNumber(
              tracker.mangaId,
              pendingVolNum
            );
            if (existingVol) {
              await this.repo.updateVolume(existingVol.id, {
                version: (existingVol.version || 1) + 1,
              });

              // Clamp any user reading progress that exceeds the new page count
              await this.repo.clampReadingProgress(existingVol.id, existingVol.pagesCount);
            }

            patchedVolumes.push({
              mangaTitle: tracker.Manga.title,
              mangaId: tracker.mangaId,
              volumeNumber: pendingVolNum,
            });
          } else {
            remainingPending.push(pendingVolNum);
          }
        }

        // Update Tracker status
        const isComplete = remainingPending.length === 0;
        await this.repo.updateTrackerStatus(tracker.id, {
          status: isComplete ? "COMPLETED" : "HYBRID",
          pendingSpanishVols: remainingPending,
        });

        if (isComplete) {
          console.log(`[Watcher] 🎉 "${tracker.Manga.title}" ha sido completado 100% en Español.`);
        }
      } catch (err) {
        console.error(
          `[Watcher] Error revisando manga "${tracker.Manga.title}": ${(err as Error).message}`
        );
      }
    }

    console.log(
      `[Watcher] Finalizado. ${patchedVolumes.length} tomo(s) parchados a Español con éxito.`
    );

    return {
      checkedTrackers: hybridTrackers.length,
      patchedVolumes,
    };
  }
}
