import { prisma } from "../../infrastructure/database/prisma.js";
import { BookProgressRepository } from "../book/book-progress.repository.js";

const bookProgressRepo = new BookProgressRepository();

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
        contentType: "MANGA" | "BOOK";
    }) {
        const { sessionId, userId, endedAt, durationSeconds, xpAwarded, contentType } = input;

        return prisma.$transaction(async (tx) => {
            // Check inside transaction to prevent race conditions (e.g. pagehide + visibilitychange firing concurrently)
            const currentSession = await tx.readingSession.findUnique({
                where: { id: sessionId },
                select: { endedAt: true }
            });

            if (!currentSession || currentSession.endedAt) {
                // If it's already closed, don't award anything again, just return the existing session
                const existing = await tx.readingSession.findUnique({ where: { id: sessionId } });
                if (!existing) throw new Error("Session not found");
                return existing;
            }

            const updatedSession = await tx.readingSession.update({
                where: { id: sessionId },
                data: {
                    endedAt,
                    durationSeconds,
                    xpAwarded,
                },
            });

            const userUpdateData: any = {
                readingTimeTotalSeconds: { increment: durationSeconds },
                readingSessionsCount: { increment: 1 },
            };
            
            if (contentType === "MANGA") {
                userUpdateData.readingTimeMangaSeconds = { increment: durationSeconds };
            } else if (contentType === "BOOK") {
                userUpdateData.readingTimeBookSeconds = { increment: durationSeconds };
            }
            
            if (xpAwarded > 0) {
                userUpdateData.readingXpTotal = { increment: xpAwarded };
            }

            await tx.user.update({
                where: { id: userId },
                data: userUpdateData,
            });

            return updatedSession;
        });
    }

    async getTotalReadingTimeByUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { readingTimeTotalSeconds: true },
        });
        return { _sum: { durationSeconds: user?.readingTimeTotalSeconds ?? 0 } };
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

    async getTotalReadingTimeByUserAndType(
        userId: string,
        contentType: "MANGA" | "BOOK"
    ) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { readingTimeMangaSeconds: true, readingTimeBookSeconds: true },
        });
        
        const seconds = contentType === "MANGA" 
            ? (user?.readingTimeMangaSeconds ?? 0) 
            : (user?.readingTimeBookSeconds ?? 0);
            
        return { _sum: { durationSeconds: seconds } };
    }

    async countCompletedByUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { readingSessionsCount: true },
        });
        return user?.readingSessionsCount ?? 0;
    }

    async countDistinctCompletedBooksByUser(userId: string) {
        return bookProgressRepo.countCompletedByUser(userId);
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
    async purgeOldSessions(retentionDays = 30) {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - retentionDays);

        // Find all sessions older than the threshold date
        const oldSessions = await prisma.readingSession.findMany({
            where: {
                endedAt: { lt: thresholdDate }
            },
            select: {
                id: true,
                userId: true,
                contentId: true,
                startedAt: true
            }
        });

        if (oldSessions.length === 0) {
            return 0;
        }

        // We need to keep the most recent session for each (userId, contentId) pair
        // to not break the 'Recent Series' feature.
        // First, get the absolute latest session date for each affected series.
        const pairsToCheck = Array.from(
            new Set(oldSessions.map((s) => `${s.userId}:${s.contentId}`))
        ).map((pair) => {
            const [userId, contentId] = pair.split(":");
            return { userId, contentId };
        });

        const latestSessions = await prisma.readingSession.groupBy({
            by: ["userId", "contentId"],
            where: {
                OR: pairsToCheck.map(p => ({ userId: p.userId as string, contentId: p.contentId as string }))
            },
            _max: { startedAt: true }
        });

        const latestDatesMap = new Map();
        for (const item of latestSessions) {
            if (item._max && item._max.startedAt) {
                latestDatesMap.set(`${item.userId}:${item.contentId}`, item._max.startedAt.getTime());
            }
        }

        // Filter old sessions that are NOT the latest for their series
        const idsToDelete = oldSessions
            .filter((session) => {
                const latestTime = latestDatesMap.get(`${session.userId}:${session.contentId}`);
                // If it's the exact same time as the latest, KEEP it.
                if (latestTime && session.startedAt.getTime() === latestTime) {
                    return false; 
                }
                return true; // DELETE it
            })
            .map((session) => session.id);

        if (idsToDelete.length === 0) {
            return 0;
        }

        const deleteResult = await prisma.readingSession.deleteMany({
            where: {
                id: { in: idsToDelete }
            }
        });

        return deleteResult.count;
    }
}
