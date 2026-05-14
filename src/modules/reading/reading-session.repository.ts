import { prisma } from "../../infrastructure/database/prisma.js";

export class ReadingSessionRepository {
    findOpenSessionByUser(userId: string) {
        return prisma.readingSession.findFirst({
            where: {
                userId,
                endedAt: null,
            },
            orderBy: {
                startedAt: "desc",
            },
        });
    }

    create(data: {
        userId: string;
        contentType: "MANGA" | "BOOK";
        contentId: string;
        startedAt: Date;
    }) {
        return prisma.readingSession.create({
            data,
        });
    }

    findById(id: string) {
        return prisma.readingSession.findUnique({
            where: { id },
        });
    }

    updateEnd(id: string, endedAt: Date, durationSeconds: number) {
        return prisma.readingSession.update({
            where: { id },
            data: {
                endedAt,
                durationSeconds,
            },
        });
    }

    getTotalReadingTimeByUser(userId: string) {
        return prisma.readingSession.aggregate({
            where: {
                userId,
                durationSeconds: { not: null },
            },
            _sum: {
                durationSeconds: true,
            },
        });
    }

    getTotalReadingTimeByUserAndType(
        userId: string,
        contentType: "MANGA" | "BOOK"
    ) {
        return prisma.readingSession.aggregate({
            where: {
                userId,
                contentType,
                durationSeconds: { not: null },
            },
            _sum: {
                durationSeconds: true,
            },
        });
    }

    countCompletedByUser(userId: string) {
        return prisma.readingSession.count({
            where: { userId, endedAt: { not: null } },
        });
    }
}