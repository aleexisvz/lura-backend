import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { VolumeCompletionService } from "./volume-completion.service.js";

const ParamsSchema = z.object({
    mangaId: z.string().min(1),
    volumeId: z.string().min(1),
});

export class VolumeCompletionController {
    constructor(private service: VolumeCompletionService) {}

    markCompleted = async (req: FastifyRequest, reply: FastifyReply) => {
        const { mangaId, volumeId } = ParamsSchema.parse(req.params);
        const userId = (req.user as any).sub;

        const result = await this.service.markCompleted(userId, mangaId, volumeId);
        return reply.status(200).send(result);
    };

    checkCompleted = async (req: FastifyRequest, reply: FastifyReply) => {
        const { mangaId, volumeId } = ParamsSchema.parse(req.params);
        const userId = (req.user as any).sub;

        const result = await this.service.isCompleted(userId, mangaId, volumeId);
        return reply.send(result);
    };
}
