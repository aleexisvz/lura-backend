import { prisma } from "../../infrastructure/database/prisma.js"

export class MangaProgressRepository {

    findLatestByUserAndManga(userId: string, mangaId: string) {
        return prisma.mangaProgress.findFirst({
            where: {
                userId,
                mangaId,
            },
            orderBy: {
                updatedAt: "desc",
            },
        })
    }

    findByUserAndMangaAndVolume(userId: string, mangaId: string, volumeId: string) {
        return prisma.mangaProgress.findUnique({
            where: {
                userId_mangaId_volumeId: {
                    userId,
                    mangaId,
                    volumeId,
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

    update(id: string, data: { page: number }) {
        return prisma.mangaProgress.update({
            where: { id },
            data,
        })
    }

    getContinueReading(userId: string, limit = 50, excludeVolumeIds: string[] = []) {
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

    findMangasByIds(ids: string[]) {
        return prisma.manga.findMany({
            where: {
                id: {
                    in: ids,
                },
            },
            select: {
                id: true,
                title: true,
                coverPath: true,
            },
        })
    }

    findVolumesByIds(ids: string[]) {
        return prisma.volume.findMany({
            where: {
                id: {
                    in: ids,
                },
            },
            select: {
                id: true,
                mangaId: true,
                number: true,
                title: true,
                pagesCount: true,
                status: true,
                coverPath: true,
            },
        })
    }

    sumPagesReadByUser(userId: string) {
        return prisma.mangaProgress.aggregate({
            where: { userId },
            _sum: { page: true, historicalPagesRead: true },
        })
    }

    accumulateAndResetPage(id: string, currentPage: number) {
        return prisma.mangaProgress.update({
            where: { id },
            data: {
                historicalPagesRead: { increment: currentPage },
                page: 1,
            },
        })
    }
}
