import { prisma } from "../../infrastructure/database/prisma.js";

export type RecentSeriesRawItem = {
    contentId: string;
    title: string;
    coverPath: string | null;
    lastStartedAt: Date;
};

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

    closeWithAward(input: {
        sessionId: string;
        userId: string;
        endedAt: Date;
        durationSeconds: number;
        xpAwarded: number;
    }) {
        const { sessionId, userId, endedAt, durationSeconds, xpAwarded } = input;

        return prisma.$transaction(async (tx) => {
            const updatedSession = await tx.readingSession.update({
                where: { id: sessionId },
                data: {
                    endedAt,
                    durationSeconds,
                    xpAwarded,
                },
            });

            if (xpAwarded > 0) {
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        readingXpTotal: {
                            increment: xpAwarded,
                        },
                    },
                });
            }

            return updatedSession;
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

    async getUserReadingXpTotal(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                readingXpTotal: true,
            },
        });

        return user?.readingXpTotal ?? 0;
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

    async countDistinctCompletedSeriesByUser(userId: string) {
        const completedSeries = await prisma.readingSession.findMany({
            where: {
                userId,
                endedAt: { not: null },
            },
            select: {
                contentType: true,
                contentId: true,
            },
            distinct: ["contentType", "contentId"],
        });

        return completedSeries.length;
    }

    async countDistinctCompletedBooksByUser(userId: string) {
        const completedBooks = await prisma.readingSession.findMany({
            where: {
                userId,
                contentType: "BOOK",
                endedAt: { not: null },
            },
            select: {
                contentId: true,
            },
            distinct: ["contentId"],
        });

        return completedBooks.length;
    }

    async findRecentMangaSeriesByUser(userId: string, limit: number): Promise<RecentSeriesRawItem[]> {
        const grouped = await prisma.readingSession.groupBy({
            by: ["contentId"],
            where: {
                userId,
                contentType: "MANGA",
            },
            _max: {
                startedAt: true,
            },
        });

        const ordered = grouped
            .filter((item) => item._max.startedAt)
            .sort((a, b) => b._max.startedAt!.getTime() - a._max.startedAt!.getTime())
            .slice(0, limit);

        const mangaIds = ordered.map((item) => item.contentId);
        if (mangaIds.length === 0) {
            return [];
        }

        const mangas = await prisma.manga.findMany({
            where: { id: { in: mangaIds } },
            select: {
                id: true,
                title: true,
                coverPath: true,
            },
        });

        const mangaById = new Map(mangas.map((manga) => [manga.id, manga]));

        return ordered
            .map((item) => {
                const manga = mangaById.get(item.contentId);
                if (!manga || !item._max.startedAt) return null;
                return {
                    contentId: manga.id,
                    title: manga.title,
                    coverPath: manga.coverPath,
                    lastStartedAt: item._max.startedAt,
                };
            })
            .filter((item): item is RecentSeriesRawItem => item !== null);
    }

    async findRecentBookSeriesByUser(userId: string, limit: number): Promise<RecentSeriesRawItem[]> {
        const grouped = await prisma.readingSession.groupBy({
            by: ["contentId"],
            where: {
                userId,
                contentType: "BOOK",
            },
            _max: {
                startedAt: true,
            },
        });

        const ordered = grouped
            .filter((item) => item._max.startedAt)
            .sort((a, b) => b._max.startedAt!.getTime() - a._max.startedAt!.getTime())
            .slice(0, limit);

        const bookIds = ordered.map((item) => item.contentId);
        if (bookIds.length === 0) {
            return [];
        }

        const books = await prisma.book.findMany({
            where: { id: { in: bookIds } },
            select: {
                id: true,
                title: true,
                coverPath: true,
            },
        });

        const bookById = new Map(books.map((book) => [book.id, book]));

        return ordered
            .map((item) => {
                const book = bookById.get(item.contentId);
                if (!book || !item._max.startedAt) return null;
                return {
                    contentId: book.id,
                    title: book.title,
                    coverPath: book.coverPath,
                    lastStartedAt: item._max.startedAt,
                };
            })
            .filter((item): item is RecentSeriesRawItem => item !== null);
    }
}
