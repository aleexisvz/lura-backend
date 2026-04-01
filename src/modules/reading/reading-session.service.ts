import { ReadingSessionRepository } from "./reading-session.repository.js";
import { AppError } from "../../shared/errors/AppError.js";

export class ReadingSessionService {
    constructor(private repo: ReadingSessionRepository) { }

    async startSession(
        userId: string,
        contentType: "MANGA" | "BOOK",
        contentId: string
    ) {
        const now = new Date();

        // A user can only have one active session at a time.
        // If an unclosed session exists (e.g. the client crashed without
        // calling endSession), automatically finalize it before creating
        // the new one so reading stats remain accurate.
        const openSession = await this.repo.findOpenSessionByUser(userId);

        if (openSession) {
            // Convert millisecond difference to whole seconds.
            // Math.max guards against clock skew producing a negative value.
            const durationSeconds = Math.max(
                0,
                Math.floor((now.getTime() - openSession.startedAt.getTime()) / 1000)
            );

            await this.repo.updateEnd(openSession.id, now, durationSeconds);
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
        // Same milliseconds-to-seconds conversion as in startSession.
        const durationSeconds = Math.max(
            0,
            Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
        );

        return this.repo.updateEnd(session.id, now, durationSeconds);
    }

    async getUserReadingStats(userId: string) {
        // Run all three aggregations in parallel since they are independent.
        const [total, manga, book] = await Promise.all([
            this.repo.getTotalReadingTimeByUser(userId),
            this.repo.getTotalReadingTimeByUserAndType(userId, "MANGA"),
            this.repo.getTotalReadingTimeByUserAndType(userId, "BOOK"),
        ]);

        // _sum.durationSeconds is null when there are no completed sessions yet;
        // default to 0 so the client always receives a number.
        return {
            totalSeconds: total._sum.durationSeconds ?? 0,
            mangaSeconds: manga._sum.durationSeconds ?? 0,
            bookSeconds: book._sum.durationSeconds ?? 0,
        };
    }
}