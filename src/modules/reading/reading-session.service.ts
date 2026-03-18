import { ReadingSessionRepository } from "./reading-session.repository.js";

export class ReadingSessionService {
    constructor(private repo: ReadingSessionRepository) { }

    async startSession(
        userId: string,
        contentType: "MANGA" | "BOOK",
        contentId: string
    ) {
        const now = new Date();

        const openSession = await this.repo.findOpenSessionByUser(userId);

        if (openSession) {
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
            throw new Error("READING_SESSION_NOT_FOUND");
        }

        if (session.userId !== userId) {
            throw new Error("READING_SESSION_FORBIDDEN");
        }

        if (session.endedAt) {
            return session;
        }

        const now = new Date();
        const durationSeconds = Math.max(
            0,
            Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
        );

        return this.repo.updateEnd(session.id, now, durationSeconds);
    }

    async getUserReadingStats(userId: string) {
        const [total, manga, book] = await Promise.all([
            this.repo.getTotalReadingTimeByUser(userId),
            this.repo.getTotalReadingTimeByUserAndType(userId, "MANGA"),
            this.repo.getTotalReadingTimeByUserAndType(userId, "BOOK"),
        ]);

        return {
            totalSeconds: total._sum.durationSeconds ?? 0,
            mangaSeconds: manga._sum.durationSeconds ?? 0,
            bookSeconds: book._sum.durationSeconds ?? 0,
        };
    }
}