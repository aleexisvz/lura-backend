import type { FastifyInstance } from "fastify";

// Orchestrators and monitors poll these routes often, so they skip the global rate limit.
const exemptFromRateLimit = {
  rateLimit: { allowList: () => true },
};

export async function healthRoutes(app: FastifyInstance) {
  // Liveness: the process is up and accepting requests. It does not check dependencies.
  app.get("/health", { config: exemptFromRateLimit }, async () => ({ status: "ok" }));
}
