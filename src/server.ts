import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function main() {
  const app = await buildApp();

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Lura API listening on port ${env.PORT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});