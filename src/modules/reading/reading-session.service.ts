import { ReadingSessionRepository } from "./reading-session.repository.js";
import { MangaProgressRepository } from "./manga-progress.repository.js";
import { VolumeCompletionRepository } from "./volume-completion.repository.js";
import { buildReadingLevelSnapshot, calculateSessionXp, getXpMultiplierInfo } from "./reading-xp.js";
import { AppError } from "../../shared/errors/AppError.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";

const DEFAULT_AUTO_CLOSED_SESSION_CAP_SECONDS = 30 * 60;

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
        private storage: CloudStorageService = new CloudStorageService()
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
        ]);

        const totalSeconds = total._sum.durationSeconds ?? 0;
        const levelSnapshot = buildReadingLevelSnapshot(readingXpTotal);
        const multiplierInfo = getXpMultiplierInfo(new Date());

        return {
            totalSessions,
            totalMinutes: Math.floor(totalSeconds / 60),
            totalSeconds,
            mangaSeconds: manga._sum.durationSeconds ?? 0,
            bookSeconds: book._sum.durationSeconds ?? 0,
            totalPagesRead: (pagesSum._sum.page ?? 0) + (pagesSum._sum.historicalPagesRead ?? 0),
            totalVolumesRead,
            totalMangasRead,
            totalSeriesRead: totalMangasRead,
            totalBooksRead,
            readingLevel: levelSnapshot.readingLevel,
            readingXpTotal: levelSnapshot.readingXpTotal,
            xpInLevel: levelSnapshot.xpInLevel,
            xpToNextLevel: levelSnapshot.xpToNextLevel,
            xpProgressPercent: levelSnapshot.xpProgressPercent,
            isHotWeekend: multiplierInfo.isHotWeekend,
            xpMultiplier: multiplierInfo.multiplier,
            activeXpEvent: multiplierInfo.activeXpEvent,
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
}
