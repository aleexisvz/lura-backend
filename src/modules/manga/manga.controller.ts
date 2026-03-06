import type { FastifyReply, FastifyRequest } from "fastify"
import { MangaService } from "./manga.service.js"

export class MangaController {

  constructor(private service: MangaService) {}

  createManga = async (req: FastifyRequest, reply: FastifyReply) => {

    const { title, author } = req.body as any
    const userId = (req.user as any).sub

    const manga = await this.service.createManga(userId, title, author)

    return reply.send(manga)
  }

  createVolume = async (req: FastifyRequest, reply: FastifyReply) => {

    const { mangaId } = req.params as any
    const { number, title } = req.body as any

    const volume = await this.service.createVolume(mangaId, number, title)

    return reply.send(volume)
  }

  uploadPages = async (req: FastifyRequest, reply: FastifyReply) => {

    const { mangaId, volumeId } = req.params as any

    const result = await this.service.uploadPages(req, mangaId, volumeId)

    return reply.send(result)
  }
}