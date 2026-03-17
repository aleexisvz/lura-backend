import type { FastifyReply, FastifyRequest } from "fastify"
import { MangaProgressService } from "./manga-progress.service.js"

export class MangaProgressController {

    constructor(private service: MangaProgressService) { }

    getProgress = async (req: FastifyRequest, reply: FastifyReply) => {

        const { mangaId } = req.params as any
        const userId = (req.user as any).sub

        const result = await this.service.getProgress(userId, mangaId)

        return reply.send(result)
    }

    updateProgress = async (req: FastifyRequest, reply: FastifyReply) => {

        const { mangaId } = req.params as any
        const userId = (req.user as any).sub

        const { volumeId, page } = req.body as any

        const result = await this.service.updateProgress(
            userId,
            mangaId,
            volumeId,
            page
        )

        return reply.send(result)
    }

    continueReading = async (req: FastifyRequest, reply: FastifyReply) => {

        const userId = (req.user as any).sub

        const result = await this.service.getContinueReading(userId)

        return reply.send(result)
    }
}