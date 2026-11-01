import type { FastifyInstance } from "fastify";
import { pingDatabase } from "../../infrastructure/database/prisma.js";

// Orchestrators and monitors poll these routes often, so they skip the global rate limit.
const exemptFromRateLimit = {
  rateLimit: { allowList: () => true },
};

export type HealthOptions = {
  checkDatabase?: () => Promise<void>;
};

export async function healthRoutes(app: FastifyInstance, options: HealthOptions = {}) {
  const checkDatabase = options.checkDatabase ?? pingDatabase;

  // Liveness: the process is up and accepting requests. It does not check dependencies.
  app.get("/health", { config: exemptFromRateLimit }, async () => ({ status: "ok" }));

  // Readiness: the service can do its work. Returns 503 when the database is unreachable.
  // The error body follows the { code, message, details } contract; details stay internal.
  app.get("/health/ready", { config: exemptFromRateLimit }, async (request, reply) => {
    try {
      await checkDatabase();
      return { status: "ok", checks: { database: "ok" } };
    } catch (err) {
      request.log.error({ err }, "Readiness check failed: database unreachable");
      return reply.code(503).send({
        code: "DATABASE_UNAVAILABLE",
        message: "Database is unavailable",
        details: null,
      });
    }
  });
}
