import type { FastifyInstance } from "fastify"
import { MangaRepository } from "./manga.repository.js"
import { MangaService } from "./manga.service.js"
import { MangaController } from "./manga.controller.js"
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js"
import { requireAuth } from "../../shared/http/auth.js"
import { requireAdmin } from "../../shared/http/requiereAdmin.js"

export async function mangaRoutes(app: FastifyInstance) {

  const repo = new MangaRepository()
  const storage = new LocalStorageService()
  const service = new MangaService(repo, storage)
  const controller = new MangaController(service)

  app.post("/", { preHandler: requireAdmin }, controller.createManga);

  app.post("/:mangaId/volumes", { preHandler: requireAdmin }, controller.createVolume);

  app.post(
    "/:mangaId/volumes/:volumeId/upload",
    { preHandler: requireAdmin },
    controller.uploadPages
  );

  app.get("/", { preHandler: requireAuth }, controller.getAllMangas);
  app.get("/:mangaId", { preHandler: requireAuth }, controller.getMangaById);
  app.get("/:mangaId/volumes", { preHandler: requireAuth }, controller.listVolumes);

  app.get(
    "/:mangaId/volumes/:volumeId/pages",
    { preHandler: requireAuth },
    controller.listVolumePages
  );

  app.get(
    "/:mangaId/volumes/:volumeId/pages/:pageNumber/image",
    { preHandler: requireAuth },
    controller.streamPageImage
  );
}