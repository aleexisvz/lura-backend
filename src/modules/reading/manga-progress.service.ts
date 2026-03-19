import { MangaProgressRepository } from "./manga-progress.repository.js"

export class MangaProgressService {

    constructor(private repo: MangaProgressRepository) { }

    async getProgress(userId: string, mangaId: string) {
        const progress = await this.repo.findByUserAndManga(userId, mangaId)

        if (!progress) {
            return null
        }

        return {
            mangaId: progress.mangaId,
            volumeId: progress.volumeId,
            page: progress.page,
            updatedAt: progress.updatedAt,
        }
    }

    async updateProgress(
        userId: string,
        mangaId: string,
        volumeId: string,
        page: number
    ) {
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
        return this.repo.getContinueReading(userId)
    }
}