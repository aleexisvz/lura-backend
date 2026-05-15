import type { FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { MangaRepository } from "./manga.repository.js";
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js";
import { naturalSortByFilename } from "../../shared/utils/natural-sort.js";
import { notFound, conflict, badRequest } from "../../shared/errors/error-factory.js";
import { getImageContentType } from "../../shared/utils/get-image-content-type.js";
import { normalizeCategories } from "../../shared/utils/normalize-categories.js";

type RawManga = {
  id: string;
  title: string;
  author: string | null;
  categories: string[];
  coverPath: string | null;
  createdAt: Date;
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
    private storage: LocalStorageService
  ) {}

  async getAllMangas(categories: string[] = []) {
    const mangas = await this.repo.findAllMangas(categories);
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

  async createManga(title: string, author?: string, categories: string[] = []) {
    const normalizedCategories = normalizeCategories(categories);
    const created = await this.repo.createManga({
      title,
      ...(author && { author }),
      categories: normalizedCategories,
    });

    return this.toPublicManga(created);
  }

  async updateManga(
    mangaId: string,
    data: { title?: string; author?: string; categories?: string[] }
  ) {
    const existing = await this.repo.findMangaById(mangaId);
    if (!existing) {
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    const updated = await this.repo.updateManga(mangaId, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.author !== undefined ? { author: data.author } : {}),
      ...(data.categories !== undefined
        ? { categories: normalizeCategories(data.categories) }
        : {}),
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
    const uploadSession = randomUUID();
    const tempDir = path.join(process.cwd(), "storage", "temp", uploadSession);

    await this.storage.ensureDir(tempDir);
    const parts = req.parts();
    const uploadedFiles: { tempFilename: string; originalFilename: string }[] = [];
    for await (const part of parts) {
      if (part.type !== "file") continue;
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
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    const finalDir = path.join(
      process.cwd(),
      "storage",
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "pages"
    );

    await this.storage.ensureDir(finalDir);
    const pages: { index: number; filename: string }[] = [];

    for (const [position, original] of sortedFiles.entries()) {
      const index = position + 1;
      const newName = `${String(index).padStart(3, "0")}.jpeg`;
      const src = path.join(tempDir, original.tempFilename);
      const dest = path.join(finalDir, newName);
      await this.storage.moveDir(src, dest);

      pages.push({
        index,
        filename: newName,
      });
    }

    await this.repo.deletePagesByVolumeId(volumeId);
    await this.repo.createPages(volumeId, pages);
    await this.repo.updateVolumeStatus(volumeId, pages.length);
    await fs.promises.rm(tempDir, { recursive: true, force: true });

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
    const extension = this.resolveCoverExtension(file.filename, file.mimetype);
    const coverDir = this.storage.resolveMangaCoverDir(mangaId);
    const absolutePath = this.storage.resolveMangaCoverPath(mangaId, extension);
    const relativePath = path.posix.join("manga", mangaId, "cover", `cover${extension}`);

    await this.storage.ensureDir(coverDir);
    await this.storage.removeFilesByPrefix(coverDir, "cover.");
    await this.storage.saveStream(file.file, absolutePath);
    await this.repo.updateMangaCoverPath(mangaId, relativePath);

    return { uploaded: true };
  }

  async uploadVolumeCover(req: FastifyRequest, mangaId: string, volumeId: string) {
    const volume = await this.repo.findVolumeById(volumeId);
    if (!volume || volume.mangaId !== mangaId) {
      throw notFound("VOLUME_NOT_FOUND", "Volume not found");
    }

    const file = await this.getRequiredFile(req);
    const extension = this.resolveCoverExtension(file.filename, file.mimetype);
    const coverDir = this.storage.resolveVolumeCoverDir(mangaId, volumeId);
    const absolutePath = this.storage.resolveVolumeCoverPath(mangaId, volumeId, extension);
    const relativePath = path.posix.join(
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "cover",
      `cover${extension}`
    );

    await this.storage.ensureDir(coverDir);
    await this.storage.removeFilesByPrefix(coverDir, "cover.");
    await this.storage.saveStream(file.file, absolutePath);
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
        coverUrl: this.toCoverUrl(volume.coverPath, `/manga/${mangaId}/volumes/${volumeId}/cover`),
      },
      pages: pages.map((page) => ({
        index: page.index,
        imageUrl: `/manga/${mangaId}/volumes/${volumeId}/pages/${page.index}/image`,
      })),
    };
  }

  async streamPageImage(reply: FastifyReply, mangaId: string, volumeId: string, pageIndex: number) {
    const volume = await this.repo.findVolumeById(volumeId);

    if (!volume || volume.mangaId !== mangaId) {
      throw notFound("VOLUME_NOT_FOUND", "Volume not found");
    }

    const page = await this.repo.findPageByVolumeAndIndex(volumeId, pageIndex);

    if (!page) {
      throw notFound("PAGE_NOT_FOUND", "Page not found");
    }

    const filepath = this.storage.resolveMangaPagePath(mangaId, volumeId, page.filename);
    const exists = await this.storage.exists(filepath);

    if (!exists) {
      throw notFound("PAGE_FILE_NOT_FOUND", "Page file not found");
    }

    return this.streamImage(reply, filepath, page.filename);
  }

  async streamMangaCover(reply: FastifyReply, mangaId: string) {
    const manga = await this.repo.findMangaById(mangaId);
    if (!manga) {
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    if (!manga.coverPath) {
      throw notFound("MANGA_COVER_NOT_FOUND", "Manga cover not found");
    }

    const filepath = this.storage.resolveAbsolutePath(manga.coverPath);
    const exists = await this.storage.exists(filepath);
    if (!exists) {
      throw notFound("COVER_FILE_NOT_FOUND", "Cover file not found");
    }

    return this.streamImage(reply, filepath, path.basename(manga.coverPath));
  }

  async streamVolumeCover(reply: FastifyReply, mangaId: string, volumeId: string) {
    const volume = await this.repo.findVolumeById(volumeId);
    if (!volume || volume.mangaId !== mangaId) {
      throw notFound("VOLUME_NOT_FOUND", "Volume not found");
    }

    if (!volume.coverPath) {
      throw notFound("VOLUME_COVER_NOT_FOUND", "Volume cover not found");
    }

    const filepath = this.storage.resolveAbsolutePath(volume.coverPath);
    const exists = await this.storage.exists(filepath);
    if (!exists) {
      throw notFound("COVER_FILE_NOT_FOUND", "Cover file not found");
    }

    return this.streamImage(reply, filepath, path.basename(volume.coverPath));
  }

  private async streamImage(reply: FastifyReply, filepath: string, filename: string) {
    const stats = await this.storage.getFileStats(filepath);
    const contentType = getImageContentType(filename);

    reply.header("Content-Type", contentType);
    reply.header("Content-Length", stats.size.toString());
    reply.header("Last-Modified", stats.mtime.toUTCString());
    reply.header("Cache-Control", "private, max-age=86400");
    reply.header("Content-Disposition", `inline; filename="${filename}"`);

    return reply.send(this.storage.createReadStream(filepath));
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

  private toCoverUrl(coverPath: string | null, fallbackUrl: string) {
    return coverPath ? fallbackUrl : null;
  }

  private toPublicManga(manga: RawManga) {
    return {
      id: manga.id,
      title: manga.title,
      author: manga.author,
      categories: manga.categories ?? [],
      coverUrl: this.toCoverUrl(manga.coverPath, `/manga/${manga.id}/cover`),
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
      coverUrl: this.toCoverUrl(
        volume.coverPath,
        `/manga/${volume.mangaId}/volumes/${volume.id}/cover`
      ),
      createdAt: volume.createdAt,
    };
  }
}
