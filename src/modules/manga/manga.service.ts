import type { TagScope } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MangaRepository } from "./manga.repository.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { naturalSortByFilename } from "../../shared/utils/natural-sort.js";
import { notFound, conflict, badRequest } from "../../shared/errors/error-factory.js";
import { getImageContentType } from "../../shared/utils/get-image-content-type.js";
import { TagsRepository } from "../tags/tags.repository.js";

type RawManga = {
  id: string;
  title: string;
  titleKanji: string | null;
  author: string | null;
  description: string | null;
  coverPath: string | null;
  status: "EN_EMISION" | "FINALIZADO";
  createdAt: Date;
  mangaTags?: Array<{
    Tag: {
      id: string;
      scope: TagScope;
      name: string;
      slug: string;
    };
  }>;
};

type RawVolume = {
  id: string;
  mangaId: string;
  number: number;
  title: string | null;
  coverPath: string | null;
  status: "UPLOADING" | "READY";
  pagesCount: number;
  createdAt: Date;
};

export class MangaService {
  constructor(
    private repo: MangaRepository,
    private storage: CloudStorageService,
    private tagsRepo: TagsRepository
  ) {}

  async getAllMangas(tagIds: string[] = []) {
    const mangas = await this.repo.findAllMangas(tagIds);
    return mangas.map((manga) => this.toPublicManga(manga));
  }

  async getMangaById(id: string) {
    const manga = await this.repo.findMangaById(id);
    return manga ? this.toPublicManga(manga) : null;
  }

  async getVolumesByMangaId(mangaId: string) {
    const volumes = await this.repo.findVolumesByMangaId(mangaId);
    return volumes.map((volume) => this.toPublicVolume(volume));
  }

  async createManga(
    title: string,
    author?: string,
    tagIds: string[] = [],
    titleKanji?: string,
    description?: string,
    status?: "EN_EMISION" | "FINALIZADO"
  ) {
    const validTagIds = await this.assertTagIdsForScope(tagIds, "MANGA");
    const created = await this.repo.createManga({
      title,
      ...(titleKanji !== undefined ? { titleKanji } : {}),
      ...(author && { author }),
      ...(description !== undefined ? { description } : {}),
      ...(status !== undefined ? { status } : {}),
      tagIds: validTagIds,
    });

    return this.toPublicManga(created);
  }

  async updateManga(
    mangaId: string,
    data: {
      title?: string;
      titleKanji?: string;
      author?: string;
      description?: string;
      tagIds?: string[];
      status?: "EN_EMISION" | "FINALIZADO";
    }
  ) {
    const existing = await this.repo.findMangaById(mangaId);
    if (!existing) {
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    const validTagIds =
      data.tagIds !== undefined ? await this.assertTagIdsForScope(data.tagIds, "MANGA") : undefined;

    const updated = await this.repo.updateManga(mangaId, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.titleKanji !== undefined ? { titleKanji: data.titleKanji } : {}),
      ...(data.author !== undefined ? { author: data.author } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(validTagIds !== undefined ? { tagIds: validTagIds } : {}),
    });

    return this.toPublicManga(updated);
  }

  async createVolume(mangaId: string, number: number, title?: string) {
    const manga = await this.repo.findMangaById(mangaId);
    if (!manga) {
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    const duplicated = await this.repo.findVolumeByMangaAndNumber(mangaId, number);
    if (duplicated) {
      throw conflict("VOLUME_NUMBER_DUPLICATE", "Volume number already exists for this manga");
    }

    const created = await this.repo.createVolume({
      mangaId,
      number,
      ...(title && { title }),
    });

    return this.toPublicVolume(created);
  }

  async updateVolume(
    mangaId: string,
    volumeId: string,
    data: { title?: string; number?: number }
  ) {
    const volume = await this.repo.findVolumeById(volumeId);
    if (!volume || volume.mangaId !== mangaId) {
      throw notFound("VOLUME_NOT_FOUND", "Volume not found");
    }

    if (data.number !== undefined && data.number !== volume.number) {
      const duplicated = await this.repo.findVolumeByMangaAndNumber(mangaId, data.number);
      if (duplicated && duplicated.id !== volumeId) {
        throw conflict("VOLUME_NUMBER_DUPLICATE", "Volume number already exists for this manga");
      }
    }

    const updated = await this.repo.updateVolume(volumeId, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.number !== undefined ? { number: data.number } : {}),
    });

    return this.toPublicVolume(updated);
  }

  async uploadPages(req: FastifyRequest, mangaId: string, volumeId: string) {
    const parts = req.parts();
    const uploadedFiles: { buffer: Buffer; originalFilename: string }[] = [];
    for await (const part of parts) {
      if (part.type !== "file") continue;
      const originalFilename = part.filename ?? `${randomUUID()}.jpeg`;

      const buffer = await part.toBuffer();
      const webpBuffer = await sharp(buffer)
        .resize({ width: 2048, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      uploadedFiles.push({
        buffer: webpBuffer,
        originalFilename,
      });
    }

    const sortedFiles = naturalSortByFilename(uploadedFiles);

    if (sortedFiles.length === 0) {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    const pages: { index: number; filename: string }[] = [];

    for (const [position, original] of sortedFiles.entries()) {
      const index = position + 1;
      const newName = `${String(index).padStart(3, "0")}.webp`;
      const dest = this.storage.resolveMangaPagePath(mangaId, volumeId, newName);
      
      await this.storage.saveStream(Readable.from(original.buffer), dest);

      pages.push({
        index,
        filename: newName,
      });
    }

    await this.repo.deletePagesByVolumeId(volumeId);
    await this.repo.createPages(volumeId, pages);
    await this.repo.updateVolumeStatus(volumeId, pages.length);

    return {
      uploaded: pages.length,
    };
  }

  async uploadMangaCover(req: FastifyRequest, mangaId: string) {
    const manga = await this.repo.findMangaById(mangaId);
    if (!manga) {
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    const file = await this.getRequiredFile(req);
    this.resolveCoverExtension(file.filename, file.mimetype); // validate input format
    const absolutePath = this.storage.resolveMangaCoverPath(mangaId, ".webp");
    const relativePath = path.posix.join("manga", mangaId, "cover", "cover.webp");

    const webpBuffer = await sharp(await file.toBuffer())
      .resize({ width: 2048, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    await this.storage.saveStream(Readable.from(webpBuffer), absolutePath);
    await this.repo.updateMangaCoverPath(mangaId, relativePath);

    return { uploaded: true };
  }

  async uploadVolumeCover(req: FastifyRequest, mangaId: string, volumeId: string) {
    const volume = await this.repo.findVolumeById(volumeId);
    if (!volume) {
      throw notFound("VOLUME_NOT_FOUND", "Volume not found");
    }

    const file = await this.getRequiredFile(req);
    this.resolveCoverExtension(file.filename, file.mimetype); // validate input format
    const absolutePath = this.storage.resolveVolumeCoverPath(mangaId, volumeId, ".webp");
    const relativePath = path.posix.join(
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "cover",
      "cover.webp"
    );

    const webpBuffer = await sharp(await file.toBuffer())
      .resize({ width: 2048, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    await this.storage.saveStream(Readable.from(webpBuffer), absolutePath);
    await this.repo.updateVolumeCoverPath(volumeId, relativePath);

    return { uploaded: true };
  }

  async listVolumePages(mangaId: string, volumeId: string) {
    const volume = await this.repo.findVolumeById(volumeId);

    if (!volume || volume.mangaId !== mangaId) {
      throw notFound("VOLUME_NOT_FOUND", "Volume not found");
    }

    const pages = await this.repo.findPagesByVolume(volumeId);

    return {
      volume: {
        id: volume.id,
        number: volume.number,
        title: volume.title,
        pagesCount: volume.pagesCount,
        status: volume.status,
        coverUrl: this.toCoverUrl(volume.coverPath),
      },
      pages: pages.map((page) => ({
        index: page.index,
        imageUrl: this.storage.getPublicUrl(this.storage.resolveMangaPagePath(mangaId, volumeId, page.filename)),
      })),
    };
  }

  private async assertTagIdsForScope(tagIds: string[], scope: TagScope) {
    if (tagIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(tagIds));
    const tags = await this.tagsRepo.findByIds(uniqueIds);

    if (tags.length !== uniqueIds.length) {
      throw badRequest("TAG_NOT_FOUND", "One or more tags do not exist");
    }

    const invalidTag = tags.find((tag) => tag.scope !== scope);
    if (invalidTag) {
      throw badRequest("TAG_SCOPE_MISMATCH", "One or more tags have invalid scope");
    }

    return uniqueIds;
  }

  private async getRequiredFile(req: FastifyRequest) {
    let file: Awaited<ReturnType<FastifyRequest["file"]>>;
    try {
      file = await req.file();
    } catch {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    if (!file) {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    return file;
  }

  private resolveCoverExtension(filename: string | undefined, mimetype: string) {
    const ext = path.extname(filename ?? "").toLowerCase();
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
      return ext;
    }

    if (mimetype === "image/png") return ".png";
    if (mimetype === "image/jpeg") return ".jpeg";
    if (mimetype === "image/webp") return ".webp";

    throw badRequest("INVALID_PARAMS", "Invalid image file");
  }

  private toCoverUrl(coverPath: string | null) {
    return coverPath ? this.storage.getPublicUrl(coverPath) : null;
  }

  private toPublicManga(manga: RawManga) {
    const tags = (manga.mangaTags ?? []).map((mangaTag) => ({
      id: mangaTag.Tag.id,
      name: mangaTag.Tag.name,
      slug: mangaTag.Tag.slug,
    }));

    return {
      id: manga.id,
      title: manga.title,
      titleKanji: manga.titleKanji,
      author: manga.author,
      description: manga.description,
      status: manga.status,
      tags,
      categories: tags.map((tag) => tag.name),
      coverUrl: this.toCoverUrl(manga.coverPath),
      createdAt: manga.createdAt,
    };
  }

  private toPublicVolume(volume: RawVolume) {
    return {
      id: volume.id,
      mangaId: volume.mangaId,
      number: volume.number,
      title: volume.title,
      status: volume.status,
      pagesCount: volume.pagesCount,
      coverUrl: this.toCoverUrl(volume.coverPath),
      createdAt: volume.createdAt,
    };
  }
}
