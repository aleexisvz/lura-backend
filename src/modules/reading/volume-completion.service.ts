import { VolumeCompletionRepository } from "./volume-completion.repository.js";
import { MangaRepository } from "../manga/manga.repository.js";
import { MangaProgressRepository } from "./manga-progress.repository.js";
import { notFound } from "../../shared/errors/error-factory.js";

export class VolumeCompletionService {
    constructor(
        private repo: VolumeCompletionRepository,
        private mangaRepo: MangaRepository,
        private progressRepo = new MangaProgressRepository()
    ) {}

    /**
     * Marks a volume as completed for a user (either triggered on reading the last page
     * or via explicit button in the reader UI).
     */
    async markCompleted(userId: string, mangaId: string, volumeId: string) {
        const volume = await this.mangaRepo.findVolumeById(volumeId);
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        return this.repo.upsert(userId, volumeId, mangaId);
    }

    /**
     * Checks whether the given volume is currently marked completed by the user.
     */
    async isCompleted(userId: string, mangaId: string, volumeId: string) {
        const volume = await this.mangaRepo.findVolumeById(volumeId);
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        const record = await this.repo.findByUserAndVolume(userId, volumeId);
        return {
            completed: record !== null,
            completedAt: record?.completedAt ?? null,
        };
    }

    /**
     * Resets reading progress for a completed volume so the user can re-read it.
     * Deactivates the completion record (preserving timesCompleted for stats) and
     * rolls the current page cursor back to 1 while archiving read pages into historicalPagesRead.
     */
    async resetCompletion(userId: string, mangaId: string, volumeId: string) {
        const volume = await this.mangaRepo.findVolumeById(volumeId);
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        // Mark completion as inactive (keeps timesCompleted for cumulative stats)
        await this.repo.deactivateByUserAndVolume(userId, volumeId);

        // Accumulate current pages into historicalPagesRead and reset position to page 1
        const progress = await this.progressRepo.findByUserAndMangaAndVolume(userId, mangaId, volumeId);
        if (progress) {
            await this.progressRepo.accumulateAndResetPage(progress.id, progress.page);
        }
    }
}
