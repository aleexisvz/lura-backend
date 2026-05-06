import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("Manga routes (api)", () => {
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

  it("GET /manga should return all mangas", async () => {
    await prisma.manga.create({
      data: {
        title: "Older",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await prisma.manga.create({
      data: {
        title: "Newer",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/manga",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((manga: { title: string }) => manga.title)).toEqual([
      "Newer",
      "Older",
    ]);
  });

  it("GET /manga/:mangaId should return manga by id", async () => {
    const manga = await prisma.manga.create({
      data: {
        title: "Spy x Family",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/manga/${manga.id}`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: manga.id,
        title: "Spy x Family",
      })
    );
  });

  it("GET /manga/:mangaId should return 404 when manga is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/manga/missing-manga-id",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "NOT_FOUND",
      message: "Manga not found",
      details: null,
    });
  });

  it("POST /manga should create manga for admin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/manga",
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        title: "One Piece",
        author: "Eiichiro Oda",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: "One Piece",
        author: "Eiichiro Oda",
      })
    );
  });

  it("POST /manga should validate invalid params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/manga",
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        title: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({ code: "INVALID_PARAMS" })
    );
  });

  it("POST /manga/:mangaId/volumes should create volume", async () => {
    const manga = await prisma.manga.create({
      data: {
        title: "Chainsaw Man",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/volumes`,
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        number: 1,
        title: "Volume 1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        mangaId: manga.id,
        number: 1,
        title: "Volume 1",
      })
    );
  });

  it("POST /manga/:mangaId/volumes should reject duplicate volume number", async () => {
    const manga = await prisma.manga.create({
      data: {
        title: "Jujutsu Kaisen",
      },
    });

    await prisma.volume.create({
      data: {
        mangaId: manga.id,
        number: 1,
        title: "Volume 1",
        status: "READY",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/volumes`,
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        number: 1,
        title: "Volume duplicate",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "VOLUME_NUMBER_DUPLICATE",
      })
    );
  });

  it("POST /manga/:mangaId/volumes should fail when manga does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/manga/missing-manga/volumes",
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        number: 1,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "MANGA_NOT_FOUND",
      })
    );
  });

  it("POST /manga/:mangaId/volumes should validate invalid params", async () => {
    const manga = await prisma.manga.create({
      data: {
        title: "Blue Lock",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/volumes`,
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        number: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "INVALID_PARAMS",
      })
    );
  });

  it("GET /manga/:mangaId should validate invalid params", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/manga/%20",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "INVALID_PARAMS",
      })
    );
  });
});
