import path from "path"
import fs from "fs"
import { randomUUID } from "crypto"
import type { FastifyRequest } from "fastify"
import { MangaRepository } from "./manga.repository.js"
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js"

export class MangaService {

  constructor(
    private repo: MangaRepository,
    private storage: LocalStorageService
  ) {}

  async createManga(userId: string, title: string, author?: string) {
    return this.repo.createManga({ 
        userId,
        title,
        ...(author && { author })
     })
  }

  async createVolume(mangaId: string, number: number, title?: string) {
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

    const uploadedFiles: string[] = []

    for await (const part of parts) {

      if (part.type !== "file") continue

      const filename = `${randomUUID()}.jpeg`

      const filepath = path.join(tempDir, filename)

      await this.storage.saveStream(part.file, filepath)

      uploadedFiles.push(filename)
    }

    if (uploadedFiles.length === 0) {
      throw new Error("NO_FILES_UPLOADED")
    }

    uploadedFiles.sort()

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

    for (const original of uploadedFiles) {

      const index = uploadedFiles.indexOf(original) + 1

      const newName = `${String(index).padStart(3, "0")}.jpeg`

      const src = path.join(tempDir, original)
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
}