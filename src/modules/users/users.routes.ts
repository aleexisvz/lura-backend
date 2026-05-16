import type { FastifyInstance } from "fastify";
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js";
import { requireAuth } from "../../shared/http/auth.js";
import { UsersController } from "./users.controller.js";
import { UsersRepository } from "./users.repository.js";
import { UsersService } from "./users.service.js";

export async function usersRoutes(app: FastifyInstance) {
  const repo = new UsersRepository();
  const storage = new LocalStorageService();
  const service = new UsersService(repo, storage);
  const controller = new UsersController(service);

  app.get("/me", { preHandler: requireAuth }, controller.getMe);
  app.post("/me/upload-profile-image", { preHandler: requireAuth }, controller.uploadProfileImage);
  app.get("/me/profile-image", { preHandler: requireAuth }, controller.streamProfileImage);
}

