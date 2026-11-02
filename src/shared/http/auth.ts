import type { FastifyRequest } from "fastify";
import type { Role } from "@prisma/client";
import { unauthorized } from "../errors/error-factory.js";

// Shape of the JWT issued in auth.service.ts: `role` and `email` in the payload,
// `sub` (the user id) as the registered claim. Every route that uses requireAuth
// can read req.user without casting.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { email: string; role: Role };
    user: { sub: string; email: string; role: Role };
  }
}

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
