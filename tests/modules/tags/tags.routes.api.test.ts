import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("Tags routes (api)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it("GET /tags?scope=MANGA should list tags by scope", async () => {
    await prisma.tag.createMany({
      data: [
        { scope: "MANGA", name: "Action", slug: "action" },
        { scope: "BOOK", name: "Fantasy", slug: "fantasy" },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/tags?scope=MANGA",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        scope: "MANGA",
        name: "Action",
        slug: "action",
      }),
    ]);
  });

  it("POST /tags should create tag for admin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tags",
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        scope: "BOOK",
        name: "  Ciencia Ficcion  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        scope: "BOOK",
        name: "ciencia ficcion",
        slug: "ciencia-ficcion",
      })
    );
  });

  it("POST /tags should reject non-admin users", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tags",
      headers: buildAuthHeader(app, "USER"),
      payload: {
        scope: "MANGA",
        name: "Aventura",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "ADMIN_ONLY",
      })
    );
  });
});
