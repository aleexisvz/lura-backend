import { prisma } from "../../infrastructure/database/prisma.js";

export class VolumeCompletionRepository {
    upsert(userId: string, volumeId: string, mangaId: string) {
        return prisma.volumeCompletion.upsert({
            where: { userId_volumeId: { userId, volumeId } },
            create: { userId, volumeId, mangaId, isActive: true, timesCompleted: 1 },
            update: { isActive: true, timesCompleted: { increment: 1 }, completedAt: new Date() },
        });
    }

    findByUserAndVolume(userId: string, volumeId: string) {
        return prisma.volumeCompletion.findFirst({
            where: { userId, volumeId, isActive: true },
        });
    }

    async totalCompletedByUser(userId: string): Promise<number> {
        const result = await prisma.volumeCompletion.aggregate({
            where: { userId },
            _sum: { timesCompleted: true },
        });
        return result._sum.timesCompleted ?? 0;
    }

    async findVolumeIdsByUser(userId: string): Promise<string[]> {
        const records = await prisma.volumeCompletion.findMany({
            where: { userId, isActive: true },
            select: { volumeId: true },
        });
        return records.map((r) => r.volumeId);
    }

    async countCompletedMangasByUser(userId: string): Promise<number> {
        const completionsByManga = await prisma.volumeCompletion.groupBy({
            by: ["mangaId"],
            where: { userId, isActive: true },
            _count: { volumeId: true },
        });

        if (completionsByManga.length === 0) {
            return 0;
        }

        const mangaIds = completionsByManga.map((item) => item.mangaId);
        const volumeCounts = await prisma.volume.groupBy({
            by: ["mangaId"],
            where: {
                mangaId: { in: mangaIds },
            },
            _count: { id: true },
        });

        const totalVolumesByManga = new Map(
            volumeCounts.map((item) => [item.mangaId, item._count.id])
        );

        let completedMangas = 0;
        for (const item of completionsByManga) {
            const totalVolumes = totalVolumesByManga.get(item.mangaId) ?? 0;
            if (totalVolumes > 0 && item._count.volumeId >= totalVolumes) {
                completedMangas += 1;
            }
        }

        return completedMangas;
    }

    deactivateByUserAndVolume(userId: string, volumeId: string) {
        return prisma.volumeCompletion.updateMany({
            where: { userId, volumeId },
            data: { isActive: false },
        });
    }

    async isMangaCompleted(userId: string, mangaId: string): Promise<boolean> {
        const [completedCount, totalVolumes] = await Promise.all([
            prisma.volumeCompletion.count({
                where: { userId, mangaId, isActive: true },
            }),
            prisma.volume.count({
                where: { mangaId },
            }),
        ]);

        return totalVolumes > 0 && completedCount >= totalVolumes;
    }
}
