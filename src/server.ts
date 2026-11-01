import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { disconnectDatabase } from "./infrastructure/database/prisma.js";
import { createShutdown } from "./shared/graceful-shutdown.js";

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

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Lura API listening on port ${env.PORT}`);
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});