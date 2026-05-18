import { MangaProgressRepository } from "./manga-progress.repository.js"
import { VolumeCompletionRepository } from "./volume-completion.repository.js"
import { notFound, unprocessableEntity } from "../../shared/errors/error-factory.js"

export class MangaProgressService {

    constructor(
        private repo: MangaProgressRepository,
        private completionRepo = new VolumeCompletionRepository()
    ) { }

    async getProgress(userId: string, mangaId: string) {
        const progress = await this.repo.findLatestByUserAndManga(userId, mangaId)

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

        // Upsert pattern: one progress record per (user, manga, volume) triplet.
        const current = await this.repo.findByUserAndMangaAndVolume(userId, mangaId, volumeId)

        if (!current) {
            return this.repo.create({
                userId,
                mangaId,
                volumeId,
                page,
            })
        }

        if (page < volume.pagesCount) {
            // If the user starts reading a previously completed volume again,
            // treat it as "in progress" for continue-reading surfaces.
            await this.completionRepo.deactivateByUserAndVolume(userId, volumeId)
        }

        // Progress never goes backwards inside the same volume.
        if (page <= current.page) {
            return current
        }

        return this.repo.update(current.id, {
            page,
        })
    }

    async getContinueReading(userId: string) {
        const completedVolumeIds = await this.completionRepo.findVolumeIdsByUser(userId)
        const completedVolumeIdsSet = new Set(completedVolumeIds)
        const progressRows = await this.repo.getContinueReading(userId, 60)
        if (progressRows.length === 0) {
            return []
        }

        const mangaIds = [...new Set(progressRows.map((item) => item.mangaId))]
        const volumeIds = [...new Set(progressRows.map((item) => item.volumeId))]
        const [mangas, volumes] = await Promise.all([
            this.repo.findMangasByIds(mangaIds),
            this.repo.findVolumesByIds(volumeIds),
        ])

        const mangaMap = new Map(
            mangas.map((manga) => [
                manga.id,
                {
                    title: manga.title,
                    coverUrl: manga.coverPath ? `/manga/${manga.id}/cover` : null,
                },
            ])
        )

        const volumeMap = new Map(
            volumes.map((volume) => [
                volume.id,
                {
                    mangaId: volume.mangaId,
                    number: volume.number,
                    title: volume.title,
                    pagesCount: volume.pagesCount,
                    status: volume.status,
                    coverUrl: volume.coverPath
                        ? `/manga/${volume.mangaId}/volumes/${volume.id}/cover`
                        : null,
                },
            ])
        )

        return progressRows
            .filter((entry) => {
                const volume = volumeMap.get(entry.volumeId)
                if (!volume || volume.mangaId !== entry.mangaId) {
                    return false
                }

                if (volume.status !== "READY") {
                    return false
                }

                const isCompleted = completedVolumeIdsSet.has(entry.volumeId)
                if (isCompleted && volume.pagesCount > 0 && entry.page >= volume.pagesCount) {
                    // Hide only volumes that are actually at the end and completed.
                    return false
                }

                // Show all active reading entries from the first saved page.
                return entry.page >= 1
            })
            .slice(0, 10)
            .map((entry) => {
                const manga = mangaMap.get(entry.mangaId)
                const volume = volumeMap.get(entry.volumeId)
                const totalPages = volume?.pagesCount ?? 0
                const progressPercent =
                    totalPages > 0
                        ? Math.max(0, Math.min(100, Math.round((entry.page / totalPages) * 100)))
                        : 0

                return {
                    mangaId: entry.mangaId,
                    volumeId: entry.volumeId,
                    pageNumber: entry.page,
                    mangaTitle: manga?.title ?? "",
                    volumeTitle: volume?.title ?? "",
                    volumeNumber: volume?.number ?? 0,
                    totalPages,
                    progressPercent,
                    coverUrl: volume?.coverUrl ?? manga?.coverUrl ?? null,
                    updatedAt: entry.updatedAt,
                }
            })
    }
}
