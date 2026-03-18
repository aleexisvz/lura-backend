import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReadingSessionService } from "./reading-session.service.js";

const StartSessionSchema = z.object({
    contentType: z.enum(["MANGA", "BOOK"]),
    contentId: z.string().min(1),
});

const EndSessionParamsSchema = z.object({
    sessionId: z.string().min(1),
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
}