import type { FastifyInstance } from "fastify";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";

export async function authRoutes(app: FastifyInstance) {
  const repo = new AuthRepository();
  const service = new AuthService(repo, app);
  const controller = new AuthController(service);

  const strictRateLimit = {
    rateLimit: { max: 10, timeWindow: "1 minute" },
  };

  app.post("/register", { config: strictRateLimit }, controller.register);
  app.post("/login", { config: strictRateLimit }, controller.login);
}