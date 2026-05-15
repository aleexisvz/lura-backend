import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { MangaService } from "./manga.service.js";
import { notFound } from "../../shared/errors/error-factory.js";

const tagIdsSchema = z.array(z.string().trim().min(1)).max(100);

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

const MangaListQuerySchema = z.object({
  tagIds: z.string().optional(),
});

const CreateMangaSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
  tagIds: tagIdsSchema.optional(),
});

const UpdateMangaSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    author: z.string().trim().min(1).optional(),
    tagIds: tagIdsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const CreateVolumeSchema = z.object({
  number: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).optional(),
});

const UpdateVolumeSchema = z
  .object({
    number: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export class MangaController {
  constructor(private service: MangaService) {}

  getAllMangas = async (req: FastifyRequest, reply: FastifyReply) => {
    const { tagIds } = MangaListQuerySchema.parse(req.query);
    const parsedTagIds = tagIds
      ? tagIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const mangas = await this.service.getAllMangas(parsedTagIds);
    return reply.send(mangas);
  };

  listVolumes = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const volumes = await this.service.getVolumesByMangaId(mangaId);
    return reply.send(volumes);
  };

  getMangaById = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const manga = await this.service.getMangaById(mangaId);

    if (!manga) {
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    return reply.send(manga);
  };

  createManga = async (req: FastifyRequest, reply: FastifyReply) => {
    const { title, author, tagIds } = CreateMangaSchema.parse(req.body);

    const manga = await this.service.createManga(title, author, tagIds ?? []);

    return reply.send(manga);
  };

  updateManga = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const body = UpdateMangaSchema.parse(req.body);
    const payload = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.author !== undefined ? { author: body.author } : {}),
      ...(body.tagIds !== undefined ? { tagIds: body.tagIds } : {}),
    };

    const manga = await this.service.updateManga(mangaId, payload);
    return reply.send(manga);
  };

  createVolume = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const { number, title } = CreateVolumeSchema.parse(req.body);

    const volume = await this.service.createVolume(mangaId, number, title);

    return reply.send(volume);
  };

  updateVolume = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params);
    const body = UpdateVolumeSchema.parse(req.body);
    const payload = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.number !== undefined ? { number: body.number } : {}),
    };

    const volume = await this.service.updateVolume(mangaId, volumeId, payload);
    return reply.send(volume);
  };

  uploadPages = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params);

    const result = await this.service.uploadPages(req, mangaId, volumeId);

    return reply.send(result);
  };

  uploadMangaCover = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    const result = await this.service.uploadMangaCover(req, mangaId);
    return reply.send(result);
  };

  uploadVolumeCover = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params);
    const result = await this.service.uploadVolumeCover(req, mangaId, volumeId);
    return reply.send(result);
  };

  listVolumePages = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params);

    const result = await this.service.listVolumePages(mangaId, volumeId);

    return reply.send(result);
  };

  streamPageImage = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId, pageNumber } = PageImageParamsSchema.parse(req.params);

    return this.service.streamPageImage(reply, mangaId, volumeId, Number(pageNumber));
  };

  streamMangaCover = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId } = MangaIdParamsSchema.parse(req.params);
    return this.service.streamMangaCover(reply, mangaId);
  };

  streamVolumeCover = async (req: FastifyRequest, reply: FastifyReply) => {
    const { mangaId, volumeId } = MangaVolumeParamsSchema.parse(req.params);
    return this.service.streamVolumeCover(reply, mangaId, volumeId);
  };
}
