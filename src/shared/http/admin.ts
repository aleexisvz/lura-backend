import type { FastifyRequest } from "fastify";
import { forbidden } from "../errors/error-factory.js";

export async function requireAdmin(req: FastifyRequest) {
  await req.jwtVerify();

  const user = req.user as any;

  if (user.role !== "ADMIN") {
    throw forbidden("ADMIN_ONLY", "Admin only");
  }
}