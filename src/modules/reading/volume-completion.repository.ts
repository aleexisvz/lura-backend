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

    deactivateByUserAndVolume(userId: string, volumeId: string) {
        return prisma.volumeCompletion.updateMany({
            where: { userId, volumeId },
            data: { isActive: false },
        });
    }
}
