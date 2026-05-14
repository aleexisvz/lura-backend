import { VolumeCompletionRepository } from "./volume-completion.repository.js";
import { MangaRepository } from "../manga/manga.repository.js";
import { notFound } from "../../shared/errors/error-factory.js";

export class VolumeCompletionService {
    constructor(
        private repo: VolumeCompletionRepository,
        private mangaRepo: MangaRepository
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
}
