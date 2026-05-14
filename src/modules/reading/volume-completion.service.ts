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

    async markCompleted(userId: string, mangaId: string, volumeId: string) {
        const volume = await this.mangaRepo.findVolumeById(volumeId);
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        return this.repo.upsert(userId, volumeId, mangaId);
    }

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

    async resetCompletion(userId: string, mangaId: string, volumeId: string) {
        const volume = await this.mangaRepo.findVolumeById(volumeId);
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        // Mark completion as inactive (keeps timesCompleted for cumulative stats)
        await this.repo.deactivateByUserAndVolume(userId, volumeId);

        // Accumulate current pages into historicalPagesRead and reset position to page 1
        const progress = await this.progressRepo.findByUserAndManga(userId, mangaId);
        if (progress && progress.volumeId === volumeId) {
            await this.progressRepo.accumulateAndResetPage(progress.id, progress.page, volumeId);
        }
    }
}
