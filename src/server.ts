import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { disconnectDatabase } from "./infrastructure/database/prisma.js";
import { createShutdown } from "./shared/graceful-shutdown.js";
import { errorTracker } from "./shared/observability/error-tracker.instance.js";
import { createFatalErrorHandler } from "./shared/process-errors.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const app = await buildApp();

  const shutdown = createShutdown({
    closeServer: () => app.close(),
    closeDatabase: disconnectDatabase,
    log: {
      info: (message) => app.log.info(message),
      error: (err, message) => app.log.error({ err }, message),
    },
    exit: (code) => process.exit(code),
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
  });

  const fatal = createFatalErrorHandler({
    log: app.log,
    capture: (error) => errorTracker.captureException(error, { source: "process" }),
    flush: errorTracker.flush,
    exit: (code) => process.exit(code),
  });
  process.on("uncaughtException", (error) => void fatal("uncaughtException")(error));
  process.on("unhandledRejection", (reason) => void fatal("unhandledRejection")(reason));

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Lura API listening on port ${env.PORT}`);
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});