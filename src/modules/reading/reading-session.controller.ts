import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReadingSessionService } from "./reading-session.service.js";

const StartSessionSchema = z.object({
    contentType: z.enum(["MANGA", "BOOK"]),
    contentId: z.string().min(1),
});

const EndSessionParamsSchema = z.object({
    sessionId: z.string().min(1),
});

const RecentSeriesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
});

export class ReadingSessionController {
    constructor(private service: ReadingSessionService) { }

    startSession = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req.user as any).sub;
        const body = StartSessionSchema.parse(req.body);

        const result = await this.service.startSession(
            userId,
            body.contentType,
            body.contentId
        );

        return reply.send(result);
    };

    endSession = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req.user as any).sub;
        const { sessionId } = EndSessionParamsSchema.parse(req.params);

        const result = await this.service.endSession(userId, sessionId);

        return reply.send(result);
    };

    getMyStats = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req.user as any).sub;

        const result = await this.service.getUserReadingStats(userId);

        return reply.send(result);
    };

    getRecentSeries = async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req.user as any).sub;
        const { limit } = RecentSeriesQuerySchema.parse(req.query);

        const result = await this.service.getRecentSeries(userId, limit ?? 12);
        return reply.send(result);
    };

    getMangaReaders = async (req: FastifyRequest, reply: FastifyReply) => {
        const { mangaId } = req.params as { mangaId: string };
        const readers = await this.service.getRecentReaders("MANGA", mangaId, 10);
        return reply.send(readers);
    };

    getBookReaders = async (req: FastifyRequest, reply: FastifyReply) => {
        const { bookId } = req.params as { bookId: string };
        const readers = await this.service.getRecentReaders("BOOK", bookId, 10);
        return reply.send(readers);
    };
}
