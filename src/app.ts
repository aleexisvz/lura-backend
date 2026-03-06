import Fastify from "fastify";
import { registerPlugins } from "./config/plugins.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { mangaRoutes } from "./modules/manga/manga.routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerPlugins(app);

  await app.register(authRoutes, { prefix: "/auth" });
 
  await app.register(mangaRoutes, { prefix: "/manga" })

  return app;
}