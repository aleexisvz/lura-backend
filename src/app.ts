import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { registerPlugins } from "./config/plugins.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { mangaRoutes } from "./modules/manga/manga.routes.js";
import { AppError } from "./shared/errors/AppError.js";
import { mangaProgressRoutes } from "./modules/reading/manga-progress.routes.js";
import { readingSessionRoutes } from "./modules/reading/reading-session.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerPlugins(app);
  
  await app.register(mangaProgressRoutes)
  await app.register(readingSessionRoutes)
  
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: "INVALID_PARAMS",
        message: "Invalid params",
        details: error.issues,
      });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return reply.status(409).send({
        code: "CONFLICT",
        message: "Resource already exists",
      });
    }

    if (typeof (error as { statusCode?: unknown }).statusCode === "number") {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode >= 400 && statusCode < 500) {
        const message = error instanceof Error ? error.message : "Request error";
        return reply.status(statusCode).send({ message });
      }
    }

    req.log.error(error);
    return reply.status(500).send({ message: "Internal server error" });
  });

  await app.register(authRoutes, { prefix: "/auth" });

  await app.register(mangaRoutes, { prefix: "/manga" })

  return app;
}