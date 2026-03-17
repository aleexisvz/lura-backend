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

        const current = await this.repo.findByUserAndManga(userId, mangaId)

        if (!current) {
            return this.repo.create({
                userId,
                mangaId,
                volumeId,
                page,
            })
        }

        // ⚠ Regla clave: no retroceder progreso
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