import { ReadingSessionRepository } from "./reading-session.repository.js";
import { MangaProgressRepository } from "./manga-progress.repository.js";
import { VolumeCompletionRepository } from "./volume-completion.repository.js";
import { buildReadingLevelSnapshot, calculateSessionXp, getXpMultiplierInfo } from "./reading-xp.js";
import { AppError } from "../../shared/errors/AppError.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { BookProgressService } from "../book/book-progress.service.js";
import { ReadingReadersRepository, type ReaderEntry } from "./reading-readers.repository.js";

const DEFAULT_AUTO_CLOSED_SESSION_CAP_SECONDS = 30 * 60;

/**
 * Combines session readers and progress readers into one list: each user once,
 * at their most recent read, most recent first. Session entries come first, so a
 * progress entry only replaces a session entry when it is newer.
 */
export function mergeRecentReaders(
    sessionReaders: ReaderEntry[],
    progressReaders: ReaderEntry[],
    limit: number
): ReaderEntry[] {
    const merged = new Map<string, ReaderEntry>();

    for (const entry of [...sessionReaders, ...progressReaders]) {
        const existing = merged.get(entry.userId);
        if (!existing || entry.lastReadAt.getTime() > existing.lastReadAt.getTime()) {
            merged.set(entry.userId, entry);
        }
    }

    return Array.from(merged.values())
        .sort((a, b) => b.lastReadAt.getTime() - a.lastReadAt.getTime())
        .slice(0, limit);
}

function resolveAutoClosedSessionCapSeconds() {
    const raw = process.env["READING_SESSION_AUTOCLOSE_CAP_SECONDS"];
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
    }
    return DEFAULT_AUTO_CLOSED_SESSION_CAP_SECONDS;
}

export class ReadingSessionService {
    constructor(
        private repo: ReadingSessionRepository,
        private progressRepo: MangaProgressRepository = new MangaProgressRepository(),
        private completionRepo: VolumeCompletionRepository = new VolumeCompletionRepository(),
        private storage: CloudStorageService = new CloudStorageService(),
        private bookProgress: BookProgressService = new BookProgressService(),
        private readersRepo: ReadingReadersRepository = new ReadingReadersRepository()
    ) { }

    async startSession(
        userId: string,
        contentType: "MANGA" | "BOOK",
        contentId: string
    ) {
        const now = new Date();
        const autoClosedSessionCapSeconds = resolveAutoClosedSessionCapSeconds();

        // A user can only have one active session at a time.
        // If an unclosed session exists (e.g. the client crashed without
        // calling endSession), automatically finalize it before creating
        // the new one so reading stats remain accurate.
        const openSession = await this.repo.findOpenSessionByUser(userId);

        if (openSession) {
            // Convert millisecond difference to whole seconds.
            // Math.max guards against clock skew producing a negative value.
            const elapsedSeconds = Math.max(
                0,
                Math.floor((now.getTime() - openSession.startedAt.getTime()) / 1000)
            );
            const durationSeconds = Math.min(elapsedSeconds, autoClosedSessionCapSeconds);
            const endedAt = new Date(openSession.startedAt.getTime() + durationSeconds * 1000);
            const xpAwarded = calculateSessionXp(durationSeconds, { at: endedAt });

            await this.repo.closeWithAward({
                sessionId: openSession.id,
                userId,
                endedAt,
                durationSeconds,
                xpAwarded,
                contentType: openSession.contentType,
            });
        }

        return this.repo.create({
            userId,
            contentType,
            contentId,
            startedAt: now,
        });
    }

    async endSession(userId: string, sessionId: string) {
        const session = await this.repo.findById(sessionId);

        if (!session) {
            throw new AppError({
                code: "READING_SESSION_NOT_FOUND",
                statusCode: 404,
                message: "Reading session not found",
            });
        }

        if (session.userId !== userId) {
            throw new AppError({
                code: "READING_SESSION_FORBIDDEN",
                statusCode: 403,
                message: "Access denied to this reading session",
            });
        }

        // Idempotent: if endedAt is already set just return the session
        // as-is so repeated calls don't change the recorded duration.
        if (session.endedAt) {
            return session;
        }

        const now = new Date();
        const autoClosedSessionCapSeconds = resolveAutoClosedSessionCapSeconds();
        const elapsedSeconds = Math.max(
            0,
            Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
        );
        const durationSeconds = Math.min(elapsedSeconds, autoClosedSessionCapSeconds);
        const xpAwarded = calculateSessionXp(durationSeconds, { at: now });

        return this.repo.closeWithAward({
            sessionId: session.id,
            userId,
            endedAt: now,
            durationSeconds,
            xpAwarded,
            contentType: session.contentType,
        });
    }

    async getUserReadingStats(userId: string) {
        // Run all aggregations in parallel since they are independent.
        const [
            total,
            manga,
            book,
            totalSessions,
            pagesSum,
            totalVolumesRead,
            totalMangasRead,
            totalBooksRead,
            readingXpTotal,
            bookPagesSum,
        ] = await Promise.all([
            this.repo.getTotalReadingTimeByUser(userId),
            this.repo.getTotalReadingTimeByUserAndType(userId, "MANGA"),
            this.repo.getTotalReadingTimeByUserAndType(userId, "BOOK"),
            this.repo.countCompletedByUser(userId),
            this.progressRepo.sumPagesReadByUser(userId),
            this.completionRepo.totalCompletedByUser(userId),
            this.completionRepo.countCompletedMangasByUser(userId),
            this.repo.countDistinctCompletedBooksByUser(userId),
            this.repo.getUserReadingXpTotal(userId),
            this.bookProgress.sumPagesForUser(userId),
        ]);

        const totalSeconds = total._sum.durationSeconds ?? 0;
        const levelSnapshot = buildReadingLevelSnapshot(readingXpTotal);
        const multiplierInfo = getXpMultiplierInfo(new Date());

        // Aggregate pages read across formats:
        // For manga, combine current progress page index with historicalPagesRead
        // so that volume resets for re-reading do not decrease lifetime statistics.
        const mangaPagesRead = (pagesSum._sum.page ?? 0) + (pagesSum._sum.historicalPagesRead ?? 0);
        const totalPagesRead = mangaPagesRead + bookPagesSum;

        return {
            totalSessions,
            totalMinutes: Math.floor(totalSeconds / 60),
            totalSeconds,
            mangaSeconds: manga._sum.durationSeconds ?? 0,
            bookSeconds: book._sum.durationSeconds ?? 0,
            totalPagesRead,
            mangaPagesRead,
            bookPagesRead: bookPagesSum,
            totalVolumesRead,
            totalMangasRead,
            totalSeriesRead: totalMangasRead,
            totalBooksRead,
            readingLevel: levelSnapshot.readingLevel,
            readingXpTotal: levelSnapshot.readingXpTotal,
            xpInLevel: levelSnapshot.xpInLevel,
            xpToNextLevel: levelSnapshot.xpToNextLevel,
            xpProgressPercent: levelSnapshot.xpProgressPercent,
            activeXpEvent: multiplierInfo.activeXpEvent,
            isHotWeekend: multiplierInfo.isHotWeekend,
            xpMultiplier: multiplierInfo.multiplier,
            xpPerMinute: multiplierInfo.xpPerMinute,
        };
    }

    async getRecentSeries(userId: string, limit = 12) {
        const [manga, books] = await Promise.all([
            this.repo.findRecentMangaSeriesByUser(userId, limit),
            this.repo.findRecentBookSeriesByUser(userId, limit),
        ]);

        return {
            manga: manga.map((item) => ({
                contentId: item.contentId,
                title: item.title,
                coverUrl: item.coverPath ? this.storage.getPublicUrl(item.coverPath) : null,
                lastStartedAt: item.lastStartedAt,
            })),
            books: books.map((item) => ({
                contentId: item.contentId,
                title: item.title,
                coverUrl: item.coverPath ? this.storage.getPublicUrl(item.coverPath) : null,
                lastStartedAt: item.lastStartedAt,
            })),
        };
    }

    async getRecentReaders(contentType: "MANGA" | "BOOK", contentId: string, limit = 10) {
        const [sessionReaders, progressReaders] = await Promise.all([
            this.readersRepo.findSessionReaders(contentType, contentId),
            contentType === "MANGA"
                ? this.readersRepo.findMangaProgressReaders(contentId)
                : this.readersRepo.findBookProgressReaders(contentId),
        ]);
        const readers = mergeRecentReaders(sessionReaders, progressReaders, limit);
        return readers.map(({ user, lastReadAt }) => {
            const levelSnapshot = buildReadingLevelSnapshot(user.readingXpTotal);
            return {
                id: user.id,
                username: user.username,
                profileImageUrl: user.profileImagePath ? this.storage.getPublicUrl(user.profileImagePath) : null,
                readingLevel: levelSnapshot.readingLevel,
                readingXpTotal: levelSnapshot.readingXpTotal,
                lastReadAt,
            };
        });
    }
}
