import { MangaProgressRepository } from "./manga-progress.repository.js"
import { VolumeCompletionRepository } from "./volume-completion.repository.js"
import { notFound, unprocessableEntity } from "../../shared/errors/error-factory.js"

export class MangaProgressService {

    constructor(
        private repo: MangaProgressRepository,
        private completionRepo = new VolumeCompletionRepository()
    ) { }

    async getProgress(userId: string, mangaId: string) {
        const progress = await this.repo.findByUserAndManga(userId, mangaId)

        if (!progress) {
            return null
        }

        const completion = await this.completionRepo.findByUserAndVolume(userId, progress.volumeId)

        return {
            mangaId: progress.mangaId,
            volumeId: progress.volumeId,
            page: progress.page,
            updatedAt: progress.updatedAt,
            completed: completion !== null,
        }
    }

    async updateProgress(
        userId: string,
        mangaId: string,
        volumeId: string,
        page: number
    ) {
        const manga = await this.repo.findMangaById(mangaId)
        if (!manga) {
            throw notFound("MANGA_NOT_FOUND", "Manga not found");
        }

        const volume = await this.repo.findVolumeById(volumeId)
        if (!volume || volume.mangaId !== mangaId) {
            throw notFound("VOLUME_NOT_FOUND", "Volume not found");
        }

        // pagesCount is 0 while a volume is still UPLOADING, so this also
        // prevents saving progress against a volume that isn't ready yet.
        if (page > volume.pagesCount) {
            throw unprocessableEntity("PAGE_OUT_OF_RANGE", `Page ${page} exceeds volume page count (${volume.pagesCount})`);
        }

        // Upsert pattern: one progress record per (user, manga) pair.
        // If none exists yet, create it; otherwise update it.
        const current = await this.repo.findByUserAndManga(userId, mangaId)

        if (!current) {
            return this.repo.create({
                userId,
                mangaId,
                volumeId,
                page,
            })
        }

        // Progress never goes backwards within the same volume.
        // If the client sends page 3 but the user is already on page 7,
        // keep the higher value.
        // Note: switching to a later volume always advances progress,
        // even if the page number is lower.
        if (
            current.volumeId === volumeId &&
            page <= current.page
        ) {
            return current
        }

        return this.repo.update(current.id, {
            volumeId,
            page,
        })
    }

    async getContinueReading(userId: string) {
        const completedVolumeIds = await this.completionRepo.findVolumeIdsByUser(userId)
        return this.repo.getContinueReading(userId, 10, completedVolumeIds)
    }
}