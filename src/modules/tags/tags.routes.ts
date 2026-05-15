import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../shared/http/requiereAdmin.js";
import { requireAuth } from "../../shared/http/auth.js";
import { TagsController } from "./tags.controller.js";
import { TagsRepository } from "./tags.repository.js";
import { TagsService } from "./tags.service.js";

export async function tagsRoutes(app: FastifyInstance) {
  const repo = new TagsRepository();
  const service = new TagsService(repo);
  const controller = new TagsController(service);

  app.get("/", { preHandler: requireAuth }, controller.listTags);
  app.post("/", { preHandler: requireAdmin }, controller.createTag);
}
