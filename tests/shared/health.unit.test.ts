import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { healthRoutes } from "../../src/shared/http/health.js";

describe("health routes (unit)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    // A tight global limit, so the test can show that /health is exempt and other routes are not.
    await app.register(rateLimit, { max: 2, timeWindow: "1 minute" });
    app.get("/other", async () => ({ ok: true }));
    await app.register(healthRoutes, { checkDatabase: async () => {} });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health returns status ok without authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("GET /health is not rate limited", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    }
  });

  it("GET /health/ready returns ok when the database check passes", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", checks: { database: "ok" } });
  });

  it("GET /health/ready returns 503 without leaking the database error", async () => {
    const failing = Fastify();
    await failing.register(healthRoutes, {
      checkDatabase: async () => {
        throw new Error("connect ECONNREFUSED db.internal:5432");
      },
    });

    const response = await failing.inject({ method: "GET", url: "/health/ready" });
    await failing.close();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "DATABASE_UNAVAILABLE",
      message: "Database is unavailable",
      details: null,
    });
    expect(response.body).not.toContain("ECONNREFUSED");
  });

  it("other routes are still rate limited with the same limit", async () => {
    await app.inject({ method: "GET", url: "/other" });
    await app.inject({ method: "GET", url: "/other" });
    const third = await app.inject({ method: "GET", url: "/other" });

    expect(third.statusCode).toBe(429);
  });
});
