import type { FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod";
import { MangaService } from "./manga.service.js"

const MangaIdParamsSchema = z.object({
  mangaId: z.string().trim().min(1),
});

const MangaVolumeParamsSchema = z.object({
  mangaId: z.string().trim().min(1),
  volumeId: z.string().trim().min(1),
});

const PageImageParamsSchema = z.object({
  mangaId: z.string().trim().min(1),
  volumeId: z.string().trim().min(1),
  pageNumber: z.coerce.number().int().positive(),
});

const CreateMangaSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
});

const CreateVolumeSchema = z.object({
  number: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).optional(),
});

export class MangaController {

  constructor(private service: MangaService) {}

  getAllMangas = async (req: FastifyRequest, reply: FastifyReply) => {
    const mangas = await this.service.getAllMangas();
    return reply.send(mangas);
  }

  getMangaById = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const manga = await this.service.getMangaById(mangaId);

    if (!manga) {
      return reply.status(404).send({ message: "Manga not found" });
    }

    return reply.send(manga);
  }


  getVolumesByMangaId = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const volumes = await this.service.getVolumesByMangaId(mangaId);
    return reply.send(volumes);
  }

  createManga = async (req: FastifyRequest, reply: FastifyReply) => {
    const { title, author } = CreateMangaSchema.parse(req.body)

    const manga = await this.service.createManga(title, author)

    return reply.send(manga)
  }

  createVolume = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params)
    const { number, title } = CreateVolumeSchema.parse(req.body)

    const volume = await this.service.createVolume(mangaId, number, title)

    return reply.send(volume)
  }

  uploadPages = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params)

    const result = await this.service.uploadPages(req, mangaId, volumeId)

    return reply.send(result)
  }

  listVolumePages = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params);
    const userId = (req.user as any).sub;

    const result = await this.service.listVolumePages(userId, mangaId, volumeId);

    return reply.send(result);
  };

  streamPageImage = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId, pageNumber } = PageImageParamsSchema.parse(req.params);
    const userId = (req.user as any).sub;

    return this.service.streamPageImage(
      reply,
      userId,
      mangaId,
      volumeId,
      pageNumber
    );
  };
}