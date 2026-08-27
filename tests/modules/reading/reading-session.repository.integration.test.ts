import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { ReadingSessionRepository } from "../../../src/modules/reading/reading-session.repository.js";
import {
  disconnectTestDatabase,
  resetTestDatabase,
} from "../../helpers/db.js";

describe("ReadingSessionRepository (integration)", () => {
  const repo = new ReadingSessionRepository();
  let userId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    const user = await prisma.user.create({
      data: { email: "reader@test.dev", username: "reader_test", password: "hash" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("create() should persist a reading session", async () => {
    const now = new Date();
    const session = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt: now,
    });

    expect(session).toMatchObject({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      endedAt: null,
      durationSeconds: null,
    });
    expect(session.id).toEqual(expect.any(String));
  });

  it("findOpenSessionByUser() should return null when no open session", async () => {
    const result = await repo.findOpenSessionByUser(userId);

    expect(result).toBeNull();
  });

  it("findOpenSessionByUser() should return the latest open session", async () => {
    const session = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt: new Date(),
    });

    const found = await repo.findOpenSessionByUser(userId);

    expect(found).toBeTruthy();
    expect(found?.id).toBe(session.id);
    expect(found?.endedAt).toBeNull();
  });

  it("findById() should return session by id", async () => {
    const session = await repo.create({
      userId,
      contentType: "BOOK",
      contentId: "book-1",
      startedAt: new Date(),
    });

    const found = await repo.findById(session.id);

    expect(found).toBeTruthy();
    expect(found?.contentType).toBe("BOOK");
    expect(found?.contentId).toBe("book-1");
  });

  it("updateEnd() should close session with duration", async () => {
    const startedAt = new Date("2026-03-18T10:00:00Z");
    const endedAt = new Date("2026-03-18T10:30:00Z");

    const session = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt,
    });

    const updated = await repo.updateEnd(session.id, endedAt, 1800);

    expect(updated.endedAt).toEqual(endedAt);
    expect(updated.durationSeconds).toBe(1800);
  });

  it("closeWithAward() should close session and increment user XP atomically", async () => {
    const startedAt = new Date("2026-03-18T10:00:00Z");
    const endedAt = new Date("2026-03-18T10:20:00Z");

    const session = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt,
    });

    const updated = await repo.closeWithAward({
      sessionId: session.id,
      userId,
      endedAt,
      durationSeconds: 1200,
      xpAwarded: 20,
      contentType: "MANGA",
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { readingXpTotal: true },
    });

    expect(updated.endedAt).toEqual(endedAt);
    expect(updated.durationSeconds).toBe(1200);
    expect(updated.xpAwarded).toBe(20);
    expect(user?.readingXpTotal).toBe(20);
  });

  it("findOpenSessionByUser() should not return closed sessions", async () => {
    const session = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
    });

    await repo.updateEnd(session.id, new Date("2026-03-18T10:30:00Z"), 1800);

    const found = await repo.findOpenSessionByUser(userId);

    expect(found).toBeNull();
  });

  it("getTotalReadingTimeByUser() should sum durations", async () => {
    const s1 = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
    });
    await repo.closeWithAward({
      sessionId: s1.id,
      userId,
      endedAt: new Date("2026-03-18T10:30:00Z"),
      durationSeconds: 1800,
      xpAwarded: 60,
      contentType: "MANGA",
    });

    const s2 = await repo.create({
      userId,
      contentType: "BOOK",
      contentId: "book-1",
      startedAt: new Date("2026-03-18T11:00:00Z"),
    });
    await repo.closeWithAward({
      sessionId: s2.id,
      userId,
      endedAt: new Date("2026-03-18T11:15:00Z"),
      durationSeconds: 900,
      xpAwarded: 30,
      contentType: "BOOK",
    });

    const result = await repo.getTotalReadingTimeByUser(userId);

    expect(result._sum.durationSeconds).toBe(2700);
  });

  it("getTotalReadingTimeByUserAndType() should filter by content type", async () => {
    const s1 = await repo.create({
      userId,
      contentType: "MANGA",
      contentId: "manga-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
    });
    await repo.closeWithAward({
      sessionId: s1.id,
      userId,
      endedAt: new Date("2026-03-18T10:30:00Z"),
      durationSeconds: 1800,
      xpAwarded: 60,
      contentType: "MANGA",
    });

    const s2 = await repo.create({
      userId,
      contentType: "BOOK",
      contentId: "book-1",
      startedAt: new Date("2026-03-18T11:00:00Z"),
    });
    await repo.closeWithAward({
      sessionId: s2.id,
      userId,
      endedAt: new Date("2026-03-18T11:15:00Z"),
      durationSeconds: 900,
      xpAwarded: 30,
      contentType: "BOOK",
    });

    const mangaTime = await repo.getTotalReadingTimeByUserAndType(userId, "MANGA");
    expect(mangaTime._sum.durationSeconds).toBe(1800);

    const bookTime = await repo.getTotalReadingTimeByUserAndType(userId, "BOOK");
    expect(bookTime._sum.durationSeconds).toBe(900);
  });

  it("getTotalReadingTimeByUser() should return zero when no completed sessions", async () => {
    const result = await repo.getTotalReadingTimeByUser(userId);

    expect(result._sum.durationSeconds).toBe(0);
  });
});
