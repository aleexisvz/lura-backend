import { prisma } from "../../infrastructure/database/prisma.js"

export class MangaProgressRepository {

    findByUserAndManga(userId: string, mangaId: string) {
        return prisma.mangaProgress.findUnique({
            where: {
                userId_mangaId: {
                    userId,
                    mangaId,
                },
            },
        })
    }

    findMangaById(id: string) {
        return prisma.manga.findUnique({ where: { id } })
    }

    findVolumeById(id: string) {
        return prisma.volume.findUnique({ where: { id } })
    }

    create(data: {
        userId: string
        mangaId: string
        volumeId: string
        page: number
    }) {
        return prisma.mangaProgress.create({
            data,
        })
    }

    update(id: string, data: {
        volumeId: string
        page: number
    }) {
        return prisma.mangaProgress.update({
            where: { id },
            data,
        })
    }

    getContinueReading(userId: string, limit = 10, excludeVolumeIds: string[] = []) {
        return prisma.mangaProgress.findMany({
            where: {
                userId,
                ...(excludeVolumeIds.length > 0
                    ? { volumeId: { notIn: excludeVolumeIds } }
                    : {}),
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
        })
    }

    sumPagesReadByUser(userId: string) {
        return prisma.mangaProgress.aggregate({
            where: { userId },
            _sum: { page: true },
        })
    }
}