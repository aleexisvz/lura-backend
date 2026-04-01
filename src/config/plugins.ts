import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { env } from "./env.js";

export async function registerPlugins(app: FastifyInstance) {
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB (coincide con EPUB limit inicial)
    },
  });

  if (env.NODE_ENV !== "test") {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
    });
  }

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });
}