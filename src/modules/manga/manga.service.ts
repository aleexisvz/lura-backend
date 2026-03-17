import type { FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { MangaRepository } from "./manga.repository.js";
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js";
import { naturalSortByFilename } from "../../shared/utils/natural-sort.js";
import { AppError } from "../../shared/errors/AppError.js";

export class MangaService {

  constructor(
    private repo: MangaRepository,
    private storage: LocalStorageService
  ) { }

  async getAllMangas() {
    return this.repo.getAllMangas()
  }

  async getMangaById(id: string) {
    return this.repo.findMangaById(id)
  }

  async getVolumesByMangaId(mangaId: string) {
    return this.repo.findVolumesByMangaId(mangaId)
  }

  async createManga(title: string, author?: string) {
    return this.repo.createManga({
      title,
      ...(author && { author })
    })
  }

  async createVolume(mangaId: string, number: number, title?: string) {
    const manga = await this.repo.findMangaById(mangaId)
    if (!manga) {
      throw new AppError({
        code: "MANGA_NOT_FOUND",
        statusCode: 404,
        message: "Manga not found",
      })
    }

    const duplicated = await this.repo.findVolumeByMangaAndNumber(mangaId, number)
    if (duplicated) {
      throw new AppError({
        code: "VOLUME_NUMBER_DUPLICATE",
        statusCode: 409,
        message: "Volume number already exists for this manga",
      })
    }

    return this.repo.createVolume({
      mangaId,
      number,
      ...(title && { title })
    })
  }

  async uploadPages(req: FastifyRequest, mangaId: string, volumeId: string) {
    const uploadSession = randomUUID()
    const tempDir = path.join(
      process.cwd(),
      "storage",
      "temp",
      uploadSession
    )

    await this.storage.ensureDir(tempDir)
    const parts = req.parts()
    const uploadedFiles: { tempFilename: string; originalFilename: string }[] = [];
    for await (const part of parts) {
      if (part.type !== "file") continue
      const originalFilename = part.filename ?? `${randomUUID()}.jpeg`;
      const extension = path.extname(originalFilename) || ".jpeg";
      const tempFilename = `${randomUUID()}${extension}`;
      const filepath = path.join(tempDir, tempFilename);

      await this.storage.saveStream(part.file, filepath);

      uploadedFiles.push({
        tempFilename,
        originalFilename,
      });
    }

    const sortedFiles = naturalSortByFilename(uploadedFiles);

    if (sortedFiles.length === 0) {
      throw new AppError({
        code: "NO_FILES_UPLOADED",
        statusCode: 400,
        message: "No files uploaded",
      })
    }

    const finalDir = path.join(
      process.cwd(),
      "storage",
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "pages"
    )

    await this.storage.ensureDir(finalDir)
    const pages: { index: number; filename: string }[] = []

    for (const original of sortedFiles) {
      const index = sortedFiles.indexOf(original) + 1
      const newName = `${String(index).padStart(3, "0")}.jpeg`
      const src = path.join(tempDir, original.tempFilename)
      const dest = path.join(finalDir, newName)
      await this.storage.moveDir(src, dest)

      pages.push({
        index: index,
        filename: newName,
      })
    }

    await this.repo.createPages(volumeId, pages)
    await this.repo.updateVolumeStatus(volumeId, pages.length)
    await fs.promises.rm(tempDir, { recursive: true, force: true })

    return {
      uploaded: pages.length,
    }
  }

  async listVolumePages(userId: string, mangaId: string, volumeId: string) {
    const volume = await this.repo.findVolumeById(volumeId);

    if (!volume) {
      throw new AppError({
        code: "VOLUME_NOT_FOUND",
        statusCode: 404,
        message: "Volume not found",
      });
    }

    const pages = await this.repo.findPagesByVolume(volumeId);

    return {
      volume: {
        id: volume.id,
        number: volume.number,
        title: volume.title,
        pagesCount: volume.pagesCount,
        status: volume.status,
      },
      pages: pages.map((page) => ({
        index: page.index,
        imageUrl: `/manga/${mangaId}/volumes/${volumeId}/pages/${page.index}/image`,
      })),
    };
  }

  async streamPageImage(
    reply: FastifyReply,
    userId: string,
    mangaId: string,
    volumeId: string,
    pageIndex: number
  ) {
    const volume = await this.repo.findVolumeById(volumeId);

    if (!volume) {
      throw new AppError({
        code: "VOLUME_NOT_FOUND",
        statusCode: 404,
        message: "Volume not found",
      });
    }

    const page = await this.repo.findPageByVolumeAndIndex(volumeId, pageIndex);

    if (!page) {
      throw new AppError({
        code: "PAGE_NOT_FOUND",
        statusCode: 404,
        message: "Page not found",
      });
    }

    const filepath = this.storage.resolveMangaPagePath(mangaId, volumeId, page.filename);
    const exists = await this.storage.exists(filepath);

    if (!exists) {
      throw new AppError({
        code: "PAGE_FILE_NOT_FOUND",
        statusCode: 404,
        message: "Page file not found",
      });
    }

    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "private, max-age=86400");
    reply.header("Content-Disposition", `inline; filename="${page.filename}"`);

    return reply.send(this.storage.createReadStream(filepath));
  }

  async updateProgress(userId: string, mangaId: string, volumeId: string, page: number) {

    const current = await this.repo.findProgress(userId, mangaId)

    if (!current) {
      return this.repo.createProgress({ userId, mangaId, volumeId, page })
    }

    if (
      volumeId === current.volumeId &&
      page <= current.page
    ) {
      return current
    }

    return this.repo.updateProgress(userId, mangaId, {
      volumeId,
      page
    })
  }
}