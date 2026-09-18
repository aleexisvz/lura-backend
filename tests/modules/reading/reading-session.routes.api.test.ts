import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("ReadingSession routes (api)", () => {
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

  it("POST /reading/sessions/start should create a reading session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: {
        contentType: "MANGA",
        contentId: "manga-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      userId: "user-test-id",
      contentType: "MANGA",
      contentId: "manga-1",
      endedAt: null,
      durationSeconds: null,
    });
  });

  it("POST /reading/sessions/start should close previous open session", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "MANGA", contentId: "manga-1" },
    });

    const firstId = first.json().id;

    await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "BOOK", contentId: "book-1" },
    });

    const closed = await prisma.readingSession.findUnique({
      where: { id: firstId },
    });

    expect(closed?.endedAt).not.toBeNull();
    expect(closed?.durationSeconds).toEqual(expect.any(Number));
  });

  it("POST /reading/sessions/:sessionId/end should end session", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "MANGA", contentId: "manga-1" },
    });

    const sessionId = start.json().id;

    const response = await app.inject({
      method: "POST",
      url: `/reading/sessions/${sessionId}/end`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: sessionId,
      durationSeconds: expect.any(Number),
    });
    expect(response.json().endedAt).not.toBeNull();
  });

  it("POST /reading/sessions/:sessionId/end should return already ended session", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "MANGA", contentId: "manga-1" },
    });

    const sessionId = start.json().id;

    await app.inject({
      method: "POST",
      url: `/reading/sessions/${sessionId}/end`,
      headers: buildAuthHeader(app, "USER"),
    });

    const response = await app.inject({
      method: "POST",
      url: `/reading/sessions/${sessionId}/end`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().endedAt).not.toBeNull();
  });

  it("GET /users/me/reading-stats should return zero stats when no sessions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/users/me/reading-stats",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      totalSessions: 0,
      totalMinutes: 0,
      totalSeconds: 0,
      mangaSeconds: 0,
      bookSeconds: 0,
      totalPagesRead: 0,
      mangaPagesRead: 0,
      bookPagesRead: 0,
      totalVolumesRead: 0,
      totalMangasRead: 0,
      totalSeriesRead: 0,
      totalBooksRead: 0,
      readingLevel: 1,
      readingXpTotal: 0,
      xpInLevel: 0,
      xpToNextLevel: 20,
      xpProgressPercent: 0,
      activeXpEvent: null,
      isHotWeekend: false,
      xpMultiplier: 1,
      xpPerMinute: 2,
    });
  });

  it("GET /users/me/reading-stats should return accumulated stats", async () => {
    const s1 = await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "MANGA", contentId: "manga-1" },
    });

    await app.inject({
      method: "POST",
      url: `/reading/sessions/${s1.json().id}/end`,
      headers: buildAuthHeader(app, "USER"),
    });

    const response = await app.inject({
      method: "GET",
      url: "/users/me/reading-stats",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    const stats = response.json();
    expect(stats.totalSeconds).toBeGreaterThanOrEqual(0);
    expect(stats.mangaSeconds).toBeGreaterThanOrEqual(0);
    expect(stats.bookSeconds).toBe(0);
    expect(stats.totalMangasRead).toBeGreaterThanOrEqual(0);
    expect(stats.totalSeriesRead).toBeGreaterThanOrEqual(0);
    expect(stats.totalBooksRead).toBeGreaterThanOrEqual(0);
    expect(stats.readingLevel).toBeGreaterThanOrEqual(1);
    expect(stats.readingXpTotal).toBeGreaterThanOrEqual(0);
    expect(stats.xpInLevel).toBeGreaterThanOrEqual(0);
    expect(stats.xpToNextLevel).toBeGreaterThan(0);
    expect(stats.xpProgressPercent).toBeGreaterThanOrEqual(0);
  });

  it("GET /users/me/recent-series should return separated recent manga and books", async () => {
    await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "MANGA", contentId: "manga-1" },
    });

    await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      headers: buildAuthHeader(app, "USER"),
      payload: { contentType: "BOOK", contentId: "book-1" },
    });

    await prisma.manga.create({
      data: { id: "manga-1", title: "Manga One" },
    });
    await prisma.book.create({
      data: { id: "book-1", title: "Book One" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/users/me/recent-series?limit=12",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      manga: [
        expect.objectContaining({
          contentId: "manga-1",
          title: "Manga One",
          coverUrl: null,
          lastStartedAt: expect.any(String),
        }),
      ],
      books: [
        expect.objectContaining({
          contentId: "book-1",
          title: "Book One",
          coverUrl: null,
          lastStartedAt: expect.any(String),
        }),
      ],
    });
  });

  it("POST /reading/sessions/start should require auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/reading/sessions/start",
      payload: { contentType: "MANGA", contentId: "manga-1" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("POST /reading/sessions/:sessionId/end should require auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/reading/sessions/some-session/end",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("GET /users/me/reading-stats should require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/users/me/reading-stats",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("GET /users/me/recent-series should require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/users/me/recent-series",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("GET /manga/:mangaId/readers should return list of readers", async () => {
    await prisma.readingSession.create({
      data: {
        userId: "user-test-id",
        contentType: "MANGA",
        contentId: "manga-readers-test",
        startedAt: new Date(),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/manga/manga-readers-test/readers",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0]).toMatchObject({
      id: "user-test-id",
      username: "user_test",
      readingLevel: expect.any(Number),
    });
  });
});
