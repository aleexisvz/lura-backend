import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { env } from "./env.js";

export async function registerPlugins(app: FastifyInstance) {
  const allowedOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

  await app.register(cors, {
    // Only listed origins get the CORS headers. Requests without an Origin header
    // (curl, server-to-server) are not browser cross-origin requests and pass through.
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Lets the browser read the pagination cursor header from other origins.
    exposedHeaders: ["X-Next-Cursor", "X-Total-Count"],
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