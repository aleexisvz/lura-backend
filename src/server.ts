import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

async function main() {
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Lura API listening on port ${env.PORT}`);
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exit(1);
});