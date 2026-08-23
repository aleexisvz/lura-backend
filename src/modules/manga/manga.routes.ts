import type { FastifyInstance } from "fastify"
import { MangaRepository } from "./manga.repository.js"
import { MangaService } from "./manga.service.js"
import { MangaController } from "./manga.controller.js"
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js"
import { requireAuth } from "../../shared/http/auth.js"
import { requireAdmin } from "../../shared/http/requiereAdmin.js"
import { TagsRepository } from "../tags/tags.repository.js"

export async function mangaRoutes(app: FastifyInstance) {

  const repo = new MangaRepository()
  const storage = new CloudStorageService()
  const tagsRepo = new TagsRepository()
  const service = new MangaService(repo, storage, tagsRepo)
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

  app.get("/featured", { preHandler: requireAuth }, controller.getFeatured);
  app.get("/recent-updates", { preHandler: requireAuth }, controller.getRecentUpdates);
  app.get("/rankings", { preHandler: requireAuth }, controller.getRankings);

  app.get("/", { preHandler: requireAuth }, controller.getAllMangas);
  app.get("/:mangaId", { preHandler: requireAuth }, controller.getMangaById);
  app.get("/:mangaId/volumes", { preHandler: requireAuth }, controller.listVolumes);
  app.get(
    "/:mangaId/volumes/:volumeId/pages",
    { preHandler: requireAuth },
    controller.listVolumePages
  );
}
