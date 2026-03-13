import type { FastifyReply, FastifyRequest } from "fastify"
import { MangaService } from "./manga.service.js"

export class MangaController {

  constructor(private service: MangaService) {}

  getAllMangas = async (req: FastifyRequest, reply: FastifyReply) => {
    const mangas = await this.service.getAllMangas();
    return reply.send(mangas);
  }

  getMangaById = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = req.params as any;
    const manga = await this.service.getMangaById(mangaId);

    if (!manga) {
      return reply.status(404).send({ message: "Manga not found" });
    }

    return reply.send(manga);
  }


  getVolumesByMangaId = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = req.params as any;
    const volumes = await this.service.getVolumesByMangaId(mangaId);
    return reply.send(volumes);
  }

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

  listVolumePages = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = req.params as any;
    const userId = (req.user as any).sub;

    const result = await this.service.listVolumePages(userId, mangaId, volumeId);

    return reply.send(result);
  };

  streamPageImage = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId, pageNumber } = req.params as any;
    const userId = (req.user as any).sub;

    return this.service.streamPageImage(
      reply,
      userId,
      mangaId,
      volumeId,
      Number(pageNumber)
    );
  };
}