import type { FastifyInstance } from "fastify";

type TestRole = "USER" | "ADMIN";

export function buildAuthHeader(app: FastifyInstance, role: TestRole = "USER") {
  const token = app.jwt.sign(
    {
      email: `${role.toLowerCase()}@tests.local`,
      role,
    },
    {
      sub: `${role.toLowerCase()}-test-id`,
    }
  );

  return { authorization: `Bearer ${token}` };
}
