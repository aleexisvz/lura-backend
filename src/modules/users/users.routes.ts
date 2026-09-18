import type { FastifyInstance } from "fastify";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { requireAuth } from "../../shared/http/auth.js";
import { UsersController } from "./users.controller.js";
import { UsersRepository } from "./users.repository.js";
import { UsersService } from "./users.service.js";

export async function usersRoutes(app: FastifyInstance) {
  const repo = new UsersRepository();
  const storage = new CloudStorageService();
  const service = new UsersService(repo, storage);
  const controller = new UsersController(service);

  app.get("/me", { preHandler: requireAuth }, controller.getMe);
  app.patch("/me", { preHandler: requireAuth }, controller.updateMe);
  app.post("/me/upload-profile-image", { preHandler: requireAuth }, controller.uploadProfileImage);

  app.get("/search", { preHandler: requireAuth }, controller.searchUsers);
  app.get("/rankings", { preHandler: requireAuth }, controller.getRankings);
  app.get("/:username", { preHandler: requireAuth }, controller.getPublicProfile);
}

