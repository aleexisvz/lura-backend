import Fastify from "fastify";
import { registerPlugins } from "./config/plugins.js";
import { authRoutes } from "./modules/auth/auth.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerPlugins(app);

  app.get("/health", async () => ({ ok: true, name: "Lura API" }));

  await app.register(authRoutes, { prefix: "/auth" });

  return app;
}