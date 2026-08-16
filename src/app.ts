import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { registerPlugins } from "./config/plugins.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { bookRoutes } from "./modules/book/book.routes.js";
import { mangaRoutes } from "./modules/manga/manga.routes.js";
import { AppError } from "./shared/errors/AppError.js";
import { startReadingSessionCronJobs } from "./modules/reading/reading-session.cron.js";
import { mangaProgressRoutes } from "./modules/reading/manga-progress.routes.js";
import { readingSessionRoutes } from "./modules/reading/reading-session.routes.js";
import { volumeCompletionRoutes } from "./modules/reading/volume-completion.routes.js";
import { tagsRoutes } from "./modules/tags/tags.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";

function defaultErrorCodeByStatus(statusCode: number) {
  if (statusCode >= 500) return "INTERNAL_ERROR";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  return "BAD_REQUEST";
}

function normalizeErrorPayload(payload: unknown, statusCode: number) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const body = payload as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };

  const message =
    typeof body.message === "string"
      ? body.message
      : statusCode >= 500
        ? "Internal server error"
        : "Request error";

  const code =
    typeof body.code === "string"
      ? body.code
      : defaultErrorCodeByStatus(statusCode);

  return {
    code,
    message,
    details: body.details ?? null,
  };
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerPlugins(app);
  
  await app.register(mangaProgressRoutes)
  await app.register(readingSessionRoutes)
  await app.register(volumeCompletionRoutes)

  app.addHook("preSerialization", async (_request, reply, payload) => {
    if (reply.statusCode < 400) {
      return payload;
    }

    return normalizeErrorPayload(payload, reply.statusCode);
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    if (reply.statusCode < 400) {
      return payload;
    }

    if (typeof payload !== "string") {
      return payload;
    }

    const contentType = reply.getHeader("content-type");
    if (typeof contentType !== "string" || !contentType.includes("application/json")) {
      return payload;
    }

    try {
      const parsed = JSON.parse(payload);
      return JSON.stringify(normalizeErrorPayload(parsed, reply.statusCode));
    } catch {
      return payload;
    }
  });
  
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details ?? null,
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
        details: null,
      });
    }

    if (typeof (error as { statusCode?: unknown }).statusCode === "number") {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode >= 400 && statusCode < 500) {
        const message = error instanceof Error ? error.message : "Request error";
        const code =
          typeof (error as { code?: unknown }).code === "string"
            ? (error as { code: string }).code
            : "BAD_REQUEST";

        return reply.status(statusCode).send({
          code,
          message,
          details: null,
        });
      }
    }

    req.log.error(error);
    return reply.status(500).send({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      details: null,
    });
  });

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(bookRoutes, { prefix: "/books" });
  await app.register(usersRoutes, { prefix: "/users" });

  await app.register(mangaRoutes, { prefix: "/manga" })
  await app.register(tagsRoutes, { prefix: "/tags" })

  startReadingSessionCronJobs();

  return app;
}
