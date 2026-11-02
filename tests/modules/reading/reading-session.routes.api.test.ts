import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
    // Pin the clock to a weekday: the "Hot Weekend" XP multiplier applies on weekends.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    try {
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
    } finally {
      vi.useRealTimers();
    }
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

  describe("recent readers merge", () => {
    const T0 = new Date("2026-10-01T10:00:00Z");
    const T1 = new Date("2026-10-10T10:00:00Z");
    const T2 = new Date("2026-10-20T10:00:00Z");

    beforeEach(async () => {
      await prisma.user.create({
        data: { id: "user-b", email: "b@tests.local", username: "user_b", password: "hashed" },
      });
    });

    it("GET /manga/:mangaId/readers keeps each user once, at their most recent read", async () => {
      const manga = await prisma.manga.create({ data: { title: "Readers merge" } });
      const volume = await prisma.volume.create({
        data: { mangaId: manga.id, number: 1, status: "READY", pagesCount: 10 },
      });
      // user-test-id: session at T1, then progress at T2 (newer, wins).
      await prisma.readingSession.create({
        data: { userId: "user-test-id", contentType: "MANGA", contentId: manga.id, startedAt: T1 },
      });
      await prisma.mangaProgress.create({
        data: { userId: "user-test-id", mangaId: manga.id, volumeId: volume.id, page: 2, updatedAt: T2 },
      });
      // user-b: progress only, at T0 (oldest).
      await prisma.mangaProgress.create({
        data: { userId: "user-b", mangaId: manga.id, volumeId: volume.id, page: 1, updatedAt: T0 },
      });

      const response = await app.inject({
        method: "GET",
        url: `/manga/${manga.id}/readers`,
        headers: buildAuthHeader(app, "USER"),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.map((r: { id: string }) => r.id)).toEqual(["user-test-id", "user-b"]);
      expect(data[0].lastReadAt).toBe(T2.toISOString());
      expect(data[1].lastReadAt).toBe(T0.toISOString());
    });

    it("GET /books/:bookId/readers lists progress readers and session readers, most recent first", async () => {
      const book = await prisma.book.create({ data: { title: "Readers merge book" } });
      // user-test-id: progress at T1.
      await prisma.bookProgress.create({
        data: { userId: "user-test-id", bookId: book.id, progressPercent: 10, updatedAt: T1 },
      });
      // user-b: session at T2 (newer), no progress.
      await prisma.readingSession.create({
        data: { userId: "user-b", contentType: "BOOK", contentId: book.id, startedAt: T2 },
      });

      const response = await app.inject({
        method: "GET",
        url: `/books/${book.id}/readers`,
        headers: buildAuthHeader(app, "USER"),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.map((r: { id: string }) => r.id)).toEqual(["user-b", "user-test-id"]);
      expect(data[0].lastReadAt).toBe(T2.toISOString());
      expect(data[1].lastReadAt).toBe(T1.toISOString());
    });
  });
});
