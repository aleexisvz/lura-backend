import type { FastifyRequest } from "fastify";

export async function requireAdmin(req: FastifyRequest) {
  await req.jwtVerify();

  const user = req.user as any;

  if (user.role !== "ADMIN") {
    throw new Error("ADMIN_ONLY");
  }
}