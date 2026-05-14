import { prisma } from "../../infrastructure/database/prisma.js";

export class VolumeCompletionRepository {
    upsert(userId: string, volumeId: string, mangaId: string) {
        return prisma.volumeCompletion.upsert({
            where: { userId_volumeId: { userId, volumeId } },
            create: { userId, volumeId, mangaId },
            update: {},
        });
    }

    findByUserAndVolume(userId: string, volumeId: string) {
        return prisma.volumeCompletion.findUnique({
            where: { userId_volumeId: { userId, volumeId } },
        });
    }

    countByUser(userId: string) {
        return prisma.volumeCompletion.count({ where: { userId } });
    }

    async findVolumeIdsByUser(userId: string): Promise<string[]> {
        const records = await prisma.volumeCompletion.findMany({
            where: { userId },
            select: { volumeId: true },
        });
        return records.map((r) => r.volumeId);
    }
}
