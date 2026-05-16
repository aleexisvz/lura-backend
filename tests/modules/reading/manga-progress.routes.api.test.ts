import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("MangaProgress routes (api)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetTestDatabase();

    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "user_test",
        password: "hashed",
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it("GET /manga/:mangaId/progress should return null when no progress", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/manga/some-manga-id/progress",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it("POST /manga/:mangaId/progress should create progress", async () => {
    const manga = await prisma.manga.create({
      data: { title: "Naruto" },
    });
    const volume = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 50 },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: {
        volumeId: volume.id,
        page: 10,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mangaId: manga.id,
      volumeId: volume.id,
      page: 10,
    });
  });

  it("POST /manga/:mangaId/progress should not regress progress on same volume", async () => {
    const manga = await prisma.manga.create({
      data: { title: "Bleach" },
    });
    const volume = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 50 },
    });

    await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 20 },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ page: 20 });
  });

  it("POST /manga/:mangaId/progress should update when advancing page", async () => {
    const manga = await prisma.manga.create({
      data: { title: "One Piece" },
    });
    const volume = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 50 },
    });

    await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 5 },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 25 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ page: 25 });
  });

  it("POST /manga/:mangaId/progress should update when changing volume", async () => {
    const manga = await prisma.manga.create({
      data: { title: "Dandadan" },
    });
    const vol1 = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 50 },
    });
    const vol2 = await prisma.volume.create({
      data: { mangaId: manga.id, number: 2, status: "READY", pagesCount: 50 },
    });

    await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: vol1.id, page: 50 },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: vol2.id, page: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ volumeId: vol2.id, page: 1 });
  });

  it("GET /manga/:mangaId/progress should return existing progress", async () => {
    const manga = await prisma.manga.create({
      data: { title: "Dragon Ball" },
    });
    const volume = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 50 },
    });

    await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 42 },
    });

    const response = await app.inject({
      method: "GET",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mangaId: manga.id,
      volumeId: volume.id,
      page: 42,
    });
  });

  it("GET /users/me/continue-reading should return empty when no progress", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/users/me/continue-reading",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("GET /users/me/continue-reading should return progress entries", async () => {
    const manga = await prisma.manga.create({
      data: { title: "Spy x Family" },
    });
    const volume = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 10 },
    });

    await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 3 },
    });

    const response = await app.inject({
      method: "GET",
      url: "/users/me/continue-reading",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ mangaId: manga.id });
  });

  it("GET /manga/:mangaId/progress should require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/manga/some-id/progress",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("POST /manga/:mangaId/progress should return 401 when unauthenticated", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/manga/some-id/progress",
      payload: { volumeId: "v1", page: 1 },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("POST /manga/:mangaId/progress should return 404 when manga does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/manga/non-existent-manga-id/progress",
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: "any", page: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "MANGA_NOT_FOUND" });
  });

  it("POST /manga/:mangaId/progress should return 404 when volume does not exist", async () => {
    const manga = await prisma.manga.create({ data: { title: "Test Manga" } });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: "non-existent-volume-id", page: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "VOLUME_NOT_FOUND" });
  });

  it("POST /manga/:mangaId/progress should return 422 when page exceeds volume pagesCount", async () => {
    const manga = await prisma.manga.create({ data: { title: "Test Manga" } });
    const volume = await prisma.volume.create({
      data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 10 },
    });

    const response = await app.inject({
      method: "POST",
      url: `/manga/${manga.id}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { volumeId: volume.id, page: 11 },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "PAGE_OUT_OF_RANGE" });
  });

  it("GET /users/me/continue-reading should require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/users/me/continue-reading",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });
});
