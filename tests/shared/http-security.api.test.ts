import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { disconnectTestDatabase } from "../helpers/db.js";

const ALLOWED_ORIGIN = "http://localhost:5173";
const OTHER_ORIGIN = "https://evil.example";

describe("HTTP security (api)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it("allows a listed origin, with credentials", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: ALLOWED_ORIGIN },
    });

    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS headers to an origin that is not listed", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: OTHER_ORIGIN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers the preflight for a listed origin and exposes the pagination headers", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/books",
      headers: {
        origin: ALLOWED_ORIGIN,
        "access-control-request-method": "GET",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
    const exposed = String(response.headers["access-control-expose-headers"] ?? "");
    expect(exposed).toContain("X-Next-Cursor");
    expect(exposed).toContain("X-Total-Count");
  });

  it("sends the request id on every response, including errors", async () => {
    const ok = await app.inject({ method: "GET", url: "/health" });
    const notFound = await app.inject({ method: "GET", url: "/no-such-route" });

    expect(ok.headers["x-request-id"]).toEqual(expect.any(String));
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers["x-request-id"]).toEqual(expect.any(String));
    expect(notFound.headers["x-request-id"]).not.toBe(ok.headers["x-request-id"]);
  });

  it("sends security headers on API responses", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
