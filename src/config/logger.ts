import pino from "pino";
import type { FastifyServerOptions } from "fastify";
import { env } from "./env.js";

export function getFastifyLoggerConfig(): NonNullable<FastifyServerOptions["logger"]> {
  if (env.NODE_ENV === "test") {
    return false;
  }

  if (env.NODE_ENV === "development") {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname,reqId",
        },
      },
    };
  }

  return {
    level: env.LOG_LEVEL,
  };
}

export const logger = pino(
  env.NODE_ENV === "test"
    ? { level: "silent" }
    : env.NODE_ENV === "development"
      ? {
          level: env.LOG_LEVEL,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname,reqId",
            },
          },
        }
      : { level: env.LOG_LEVEL }
);
