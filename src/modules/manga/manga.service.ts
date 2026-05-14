import type { FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { MangaRepository } from "./manga.repository.js";
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js";
import { naturalSortByFilename } from "../../shared/utils/natural-sort.js";
import { notFound, conflict, badRequest } from "../../shared/errors/error-factory.js";
import { getImageContentType } from "../../shared/utils/get-image-content-type.js";

export class MangaService {

  constructor(
    private repo: MangaRepository,
    private storage: LocalStorageService
  ) { }

  async getAllMangas() {
    return this.repo.findAllMangas()
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
      throw notFound("MANGA_NOT_FOUND", "Manga not found");
    }

    const duplicated = await this.repo.findVolumeByMangaAndNumber(mangaId, number)
    if (duplicated) {
      throw conflict("VOLUME_NUMBER_DUPLICATE", "Volume number already exists for this manga");
    }

    return this.repo.createVolume({
      mangaId,
      number,
      ...(title && { title })
    })
  }

  async uploadPages(req: FastifyRequest, mangaId: string, volumeId: string) {
    // Each upload gets its own isolated temp directory so that concurrent
    // uploads for the same volume don't overwrite each other's files.
    const uploadSession = randomUUID()
    const tempDir = path.join(
      process.cwd(),
      "storage",
      "temp",
      uploadSession
    )

    // --- Phase 1: stream every multipart file into the temp directory ---
    // Files are stored under a UUID name to avoid collisions; the original
    // filename is preserved separately so we can sort by it afterwards.
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

    // --- Phase 2: sort pages by their original filename ---
    // Natural sort ensures "page10.jpg" comes after "page9.jpg" instead of
    // after "page1.jpg" as lexicographic sort would produce.
    // Example: ["page2.jpg", "page10.jpg", "page1.jpg"] → ["page1.jpg", "page2.jpg", "page10.jpg"]
    const sortedFiles = naturalSortByFilename(uploadedFiles);

    if (sortedFiles.length === 0) {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    // --- Phase 3: move files to their final location with canonical names ---
    // Pages are renamed to zero-padded indexes so the filesystem order is
    // always predictable: 001.jpeg, 002.jpeg, … 099.jpeg, 100.jpeg, etc.
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
      // e.g. index 7 → "007.jpeg"
      const newName = `${String(index).padStart(3, "0")}.jpeg`
      const src = path.join(tempDir, original.tempFilename)
      const dest = path.join(finalDir, newName)
      await this.storage.moveDir(src, dest)

      pages.push({
        index: index,
        filename: newName,
      })
    }

    await this.repo.deletePagesByVolumeId(volumeId)
    await this.repo.createPages(volumeId, pages)
    // Mark the volume as READY and store the final page count.
    await this.repo.updateVolumeStatus(volumeId, pages.length)
    // Clean up the temp directory; use force:true so a partial upload
    // doesn't leave an unremovable directory behind.
    await fs.promises.rm(tempDir, { recursive: true, force: true })

    return {
      uploaded: pages.length,
    }
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
      },
      pages: pages.map((page) => ({
        index: page.index,
        imageUrl: `/manga/${mangaId}/volumes/${volumeId}/pages/${page.index}/image`,
      })),
    };
  }

  async streamPageImage(
    reply: FastifyReply,
    mangaId: string,
    volumeId: string,
    pageIndex: number
  ) {
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

    const stats = await this.storage.getFileStats(filepath);
    const contentType = getImageContentType(page.filename);

    reply.header("Content-Type", contentType);
    reply.header("Content-Length", stats.size.toString());
    reply.header("Last-Modified", stats.mtime.toUTCString());
    // Cache for 24 h on the client only (private) — pages never change once
    // uploaded, so long-lived caching is safe; "private" prevents CDN caching
    // of potentially user-restricted content.
    reply.header("Cache-Control", "private, max-age=86400");
    // "inline" tells the browser to render the image in-place instead of
    // triggering a file download.
    reply.header("Content-Disposition", `inline; filename="${page.filename}"`);

    // Stream the file directly to the response to avoid loading it fully into
    // memory — important for large images.
    return reply.send(this.storage.createReadStream(filepath));
  }
}