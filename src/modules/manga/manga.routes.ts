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
  app.patch("/:mangaId", { preHandler: requireAdmin }, controller.updateManga);

  app.post("/:mangaId/volumes", { preHandler: requireAdmin }, controller.createVolume);
  app.patch(
    "/:mangaId/volumes/:volumeId",
    { preHandler: requireAdmin },
    controller.updateVolume
  );

  app.post(
    "/:mangaId/volumes/:volumeId/upload",
    { preHandler: requireAdmin },
    controller.uploadPages
  );

  app.post(
    "/:mangaId/upload-cover",
    { preHandler: requireAdmin },
    controller.uploadMangaCover
  );

  app.post(
    "/:mangaId/volumes/:volumeId/upload-cover",
    { preHandler: requireAdmin },
    controller.uploadVolumeCover
  );

  app.get("/", { preHandler: requireAuth }, controller.getAllMangas);
  app.get("/:mangaId", { preHandler: requireAuth }, controller.getMangaById);
  app.get("/:mangaId/cover", { preHandler: requireAuth }, controller.streamMangaCover);
  app.get("/:mangaId/volumes", { preHandler: requireAuth }, controller.listVolumes);
  app.get(
    "/:mangaId/volumes/:volumeId/cover",
    { preHandler: requireAuth },
    controller.streamVolumeCover
  );

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
