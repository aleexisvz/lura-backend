import type { FastifyRequest } from "fastify";
import { unauthorized } from "../errors/error-factory.js";

export async function requireAuth(req: FastifyRequest) {
  try {
    await req.jwtVerify();
  } catch (error) {
    const jwtCode = (error as { code?: unknown })?.code;

    if (jwtCode === "FST_JWT_NO_AUTHORIZATION_IN_HEADER") {
      throw unauthorized("UNAUTHORIZED", "Authentication required");
    }

    throw unauthorized("INVALID_TOKEN", "Invalid token");
  }
}
