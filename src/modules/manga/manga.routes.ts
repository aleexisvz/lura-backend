import type { FastifyInstance } from "fastify"
import { MangaRepository } from "./manga.repository.js"
import { MangaService } from "./manga.service.js"
import { MangaController } from "./manga.controller.js"
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js"
import { requireAuth } from "../../shared/http/auth.js"

export async function mangaRoutes(app: FastifyInstance) {

  const repo = new MangaRepository()
  const storage = new LocalStorageService()
  const service = new MangaService(repo, storage)
  const controller = new MangaController(service)

  app.post(
    "/",
    { preHandler: requireAuth },
    controller.createManga
  )

  app.post(
    "/:mangaId/volumes",
    { preHandler: requireAuth },
    controller.createVolume
  )

  app.post(
    "/:mangaId/volumes/:volumeId/upload",
    { preHandler: requireAuth },
    controller.uploadPages
  )
}