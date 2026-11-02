import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingSessionService } from "../../../src/modules/reading/reading-session.service.js";

describe("ReadingSessionService (unit)", () => {
  const repo = {
    findOpenSessionByUser: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateEnd: vi.fn(),
    closeWithAward: vi.fn(),
    getTotalReadingTimeByUser: vi.fn(),
    getTotalReadingTimeByUserAndType: vi.fn(),
    countCompletedByUser: vi.fn(),
    findRecentMangaSeriesByUser: vi.fn(),
    findRecentBookSeriesByUser: vi.fn(),
    getUserReadingXpTotal: vi.fn(),
  };

  const progressRepo = {
    sumPagesReadByUser: vi.fn(),
  };

  const bookProgress = {
    sumPagesForUser: vi.fn(),
    countCompletedForUser: vi.fn(),
  };

  const completionRepo = {
    totalCompletedByUser: vi.fn(),
    countCompletedMangasByUser: vi.fn(),
  };

  const storage = {
    getPublicUrl: vi.fn((path: string) => `https://cdn.example.com/${path}`),
  };

  let service: ReadingSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.READING_SESSION_AUTOCLOSE_CAP_SECONDS;
    service = new ReadingSessionService(
      repo as any,
      progressRepo as any,
      completionRepo as any,
      storage as any,
      bookProgress as any
    );
    repo.countCompletedByUser.mockResolvedValue(0);
    progressRepo.sumPagesReadByUser.mockResolvedValue({
      _sum: { page: 0, historicalPagesRead: 0 },
    });
    completionRepo.totalCompletedByUser.mockResolvedValue(0);
    completionRepo.countCompletedMangasByUser.mockResolvedValue(0);
    bookProgress.sumPagesForUser.mockResolvedValue(0);
    bookProgress.countCompletedForUser.mockResolvedValue(0);
    repo.findRecentMangaSeriesByUser.mockResolvedValue([]);
    repo.findRecentBookSeriesByUser.mockResolvedValue([]);
    repo.getUserReadingXpTotal.mockResolvedValue(0);
  });

  it("startSession() should create new session when no open session", async () => {
    repo.findOpenSessionByUser.mockResolvedValue(null);
    repo.create.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      contentType: "MANGA",
      contentId: "manga-1",
    });

    const result = await service.startSession("user-1", "MANGA", "manga-1");

    expect(repo.findOpenSessionByUser).toHaveBeenCalledWith("user-1");
    expect(repo.closeWithAward).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        contentType: "MANGA",
        contentId: "manga-1",
      })
    );
    expect(result.id).toBe("session-1");
  });

  it("startSession() should close open session before creating new one", async () => {
    const openSession = {
      id: "old-session",
      userId: "user-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
    };

    repo.findOpenSessionByUser.mockResolvedValue(openSession);
    repo.create.mockResolvedValue({
      id: "new-session",
      userId: "user-1",
      contentType: "BOOK",
      contentId: "book-1",
    });

    const result = await service.startSession("user-1", "BOOK", "book-1");

    expect(repo.closeWithAward).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "old-session",
        userId: "user-1",
        durationSeconds: expect.any(Number),
        xpAwarded: expect.any(Number),
      })
    );
    expect(result.id).toBe("new-session");
  });

  it("startSession() should cap stale auto-closed session duration", async () => {
    const openSession = {
      id: "stale-session",
      userId: "user-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
    };

    repo.findOpenSessionByUser.mockResolvedValue(openSession);
    repo.create.mockResolvedValue({
      id: "new-session",
      userId: "user-1",
      contentType: "MANGA",
      contentId: "manga-1",
    });

    await service.startSession("user-1", "MANGA", "manga-1");

    expect(repo.closeWithAward).toHaveBeenCalledWith({
      sessionId: "stale-session",
      userId: "user-1",
      endedAt: new Date(openSession.startedAt.getTime() + 1800 * 1000),
      durationSeconds: 1800,
      xpAwarded: 60,
    });
  });

  it("endSession() should throw when session not found", async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.endSession("user-1", "missing-session")
    ).rejects.toThrow("Reading session not found");
  });

  it("endSession() should throw when user doesn't own session", async () => {
    repo.findById.mockResolvedValue({
      id: "session-1",
      userId: "other-user",
      endedAt: null,
    });

    await expect(
      service.endSession("user-1", "session-1")
    ).rejects.toThrow("Access denied to this reading session");
  });

  it("endSession() should return already ended session without update", async () => {
    const endedSession = {
      id: "session-1",
      userId: "user-1",
      endedAt: new Date("2026-03-18T10:30:00Z"),
      durationSeconds: 1800,
    };
    repo.findById.mockResolvedValue(endedSession);

    const result = await service.endSession("user-1", "session-1");

    expect(repo.closeWithAward).not.toHaveBeenCalled();
    expect(result).toBe(endedSession);
  });

  it("endSession() should end open session with calculated duration", async () => {
    repo.findById.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
      endedAt: null,
    });
    repo.closeWithAward.mockResolvedValue({
      id: "session-1",
      endedAt: expect.any(Date),
      durationSeconds: expect.any(Number),
      xpAwarded: expect.any(Number),
    });

    await service.endSession("user-1", "session-1");

    expect(repo.closeWithAward).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        userId: "user-1",
        durationSeconds: expect.any(Number),
        xpAwarded: expect.any(Number),
      })
    );
  });

  it("endSession() should compute XP with minute floor and session cap", async () => {
    repo.findById.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
      endedAt: null,
    });

    repo.closeWithAward.mockResolvedValue({
      id: "session-1",
      endedAt: new Date(),
      durationSeconds: expect.any(Number),
      xpAwarded: 60,
    });

    await service.endSession("user-1", "session-1");

    expect(repo.closeWithAward).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: expect.any(Number),
        xpAwarded: expect.any(Number),
      })
    );
  });

  it("getUserReadingStats() should return aggregated stats", async () => {
    repo.getTotalReadingTimeByUser.mockResolvedValue({
      _sum: { durationSeconds: 3600 },
    });
    repo.getTotalReadingTimeByUserAndType
      .mockResolvedValueOnce({ _sum: { durationSeconds: 2400 } })
      .mockResolvedValueOnce({ _sum: { durationSeconds: 1200 } });

    repo.countCompletedByUser.mockResolvedValue(3);
    progressRepo.sumPagesReadByUser.mockResolvedValue({
      _sum: { page: 120, historicalPagesRead: 30 },
    });
    completionRepo.totalCompletedByUser.mockResolvedValue(7);
    completionRepo.countCompletedMangasByUser.mockResolvedValue(2);
    bookProgress.countCompletedForUser.mockResolvedValue(2);
    repo.getUserReadingXpTotal.mockResolvedValue(95);

    const result = await service.getUserReadingStats("user-1");

    expect(result).toMatchObject({
      totalSessions: 3,
      totalMinutes: 60,
      totalSeconds: 3600,
      mangaSeconds: 2400,
      bookSeconds: 1200,
      totalPagesRead: 150,
      totalVolumesRead: 7,
      totalMangasRead: 2,
      totalSeriesRead: 2,
      totalBooksRead: 2,
      readingLevel: 3,
      readingXpTotal: 95,
      xpInLevel: 40,
      xpToNextLevel: 50,
      xpProgressPercent: 80,
    });
    expect(typeof result.isHotWeekend).toBe("boolean");
    expect(typeof result.xpMultiplier).toBe("number");
    expect(typeof result.xpPerMinute).toBe("number");
  });

  it("getUserReadingStats() should handle null sums", async () => {
    repo.getTotalReadingTimeByUser.mockResolvedValue({
      _sum: { durationSeconds: null },
    });
    repo.getTotalReadingTimeByUserAndType.mockResolvedValue({
      _sum: { durationSeconds: null },
    });
    repo.countCompletedByUser.mockResolvedValue(0);
    progressRepo.sumPagesReadByUser.mockResolvedValue({
      _sum: { page: null, historicalPagesRead: null },
    });
    completionRepo.totalCompletedByUser.mockResolvedValue(0);
    completionRepo.countCompletedMangasByUser.mockResolvedValue(0);
    bookProgress.countCompletedForUser.mockResolvedValue(0);
    repo.getUserReadingXpTotal.mockResolvedValue(0);

    const result = await service.getUserReadingStats("user-1");

    expect(result).toMatchObject({
      totalSessions: 0,
      totalMinutes: 0,
      totalSeconds: 0,
      mangaSeconds: 0,
      bookSeconds: 0,
      totalPagesRead: 0,
      totalVolumesRead: 0,
      totalMangasRead: 0,
      totalSeriesRead: 0,
      totalBooksRead: 0,
      readingLevel: 1,
      readingXpTotal: 0,
      xpInLevel: 0,
      xpToNextLevel: 20,
      xpProgressPercent: 0,
    });
    expect(typeof result.isHotWeekend).toBe("boolean");
    expect(typeof result.xpMultiplier).toBe("number");
    expect(typeof result.xpPerMinute).toBe("number");
  });

  it("getRecentSeries() should return items ordered and mapped by type", async () => {
    repo.findRecentMangaSeriesByUser.mockResolvedValue([
      {
        contentId: "m-1",
        title: "Manga 1",
        coverPath: "manga/m-1/cover/cover.webp",
        lastStartedAt: new Date("2026-05-01T10:00:00.000Z"),
      },
    ]);
    repo.findRecentBookSeriesByUser.mockResolvedValue([
      {
        contentId: "b-1",
        title: "Book 1",
        coverPath: null,
        lastStartedAt: new Date("2026-05-01T09:00:00.000Z"),
      },
    ]);

    const result = await service.getRecentSeries("user-1", 12);

    expect(repo.findRecentMangaSeriesByUser).toHaveBeenCalledWith("user-1", 12);
    expect(repo.findRecentBookSeriesByUser).toHaveBeenCalledWith("user-1", 12);
    expect(result).toEqual({
      manga: [
        {
          contentId: "m-1",
          title: "Manga 1",
          coverUrl: "https://cdn.example.com/manga/m-1/cover/cover.webp",
          lastStartedAt: new Date("2026-05-01T10:00:00.000Z"),
        },
      ],
      books: [
        {
          contentId: "b-1",
          title: "Book 1",
          coverUrl: null,
          lastStartedAt: new Date("2026-05-01T09:00:00.000Z"),
        },
      ],
    });
  });
});
