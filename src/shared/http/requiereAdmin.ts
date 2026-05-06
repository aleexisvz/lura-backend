import type { FastifyRequest } from "fastify";
import { forbidden } from "../errors/error-factory.js";
import { requireAuth } from "./auth.js";

export async function requireAdmin(req: FastifyRequest) {
  await requireAuth(req);

  const user = req.user as any;

  if (user.role !== "ADMIN") {
    throw forbidden("ADMIN_ONLY", "Admin only");
  }
}
