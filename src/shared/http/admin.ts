import type { FastifyRequest } from "fastify";
import { AppError } from "../errors/AppError.js";

export async function requireAdmin(req: FastifyRequest) {
  await req.jwtVerify();

  const user = req.user as any;

  if (user.role !== "ADMIN") {
    throw new AppError({
      code: "ADMIN_ONLY",
      statusCode: 403,
      message: "Admin only",
    });
  }
}