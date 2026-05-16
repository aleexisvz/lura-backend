import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingSessionService } from "../../../src/modules/reading/reading-session.service.js";

describe("ReadingSessionService (unit)", () => {
  const repo = {
    findOpenSessionByUser: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateEnd: vi.fn(),
    getTotalReadingTimeByUser: vi.fn(),
    getTotalReadingTimeByUserAndType: vi.fn(),
    countCompletedByUser: vi.fn(),
    countDistinctCompletedSeriesByUser: vi.fn(),
    countDistinctCompletedBooksByUser: vi.fn(),
    findRecentMangaSeriesByUser: vi.fn(),
    findRecentBookSeriesByUser: vi.fn(),
  };

  const progressRepo = {
    sumPagesReadByUser: vi.fn(),
  };

  const completionRepo = {
    totalCompletedByUser: vi.fn(),
    countCompletedMangasByUser: vi.fn(),
  };

  let service: ReadingSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReadingSessionService(
      repo as any,
      progressRepo as any,
      completionRepo as any
    );
    repo.countCompletedByUser.mockResolvedValue(0);
    progressRepo.sumPagesReadByUser.mockResolvedValue({
      _sum: { page: 0, historicalPagesRead: 0 },
    });
    completionRepo.totalCompletedByUser.mockResolvedValue(0);
    completionRepo.countCompletedMangasByUser.mockResolvedValue(0);
    repo.countDistinctCompletedSeriesByUser.mockResolvedValue(0);
    repo.countDistinctCompletedBooksByUser.mockResolvedValue(0);
    repo.findRecentMangaSeriesByUser.mockResolvedValue([]);
    repo.findRecentBookSeriesByUser.mockResolvedValue([]);
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
    expect(repo.updateEnd).not.toHaveBeenCalled();
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

    expect(repo.updateEnd).toHaveBeenCalledWith(
      "old-session",
      expect.any(Date),
      expect.any(Number)
    );
    expect(result.id).toBe("new-session");
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

    expect(repo.updateEnd).not.toHaveBeenCalled();
    expect(result).toBe(endedSession);
  });

  it("endSession() should end open session with calculated duration", async () => {
    repo.findById.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      startedAt: new Date("2026-03-18T10:00:00Z"),
      endedAt: null,
    });
    repo.updateEnd.mockResolvedValue({
      id: "session-1",
      endedAt: expect.any(Date),
      durationSeconds: expect.any(Number),
    });

    await service.endSession("user-1", "session-1");

    expect(repo.updateEnd).toHaveBeenCalledWith(
      "session-1",
      expect.any(Date),
      expect.any(Number)
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
    repo.countDistinctCompletedSeriesByUser.mockResolvedValue(4);
    repo.countDistinctCompletedBooksByUser.mockResolvedValue(2);

    const result = await service.getUserReadingStats("user-1");

    expect(result).toEqual({
      totalSessions: 3,
      totalMinutes: 60,
      totalSeconds: 3600,
      mangaSeconds: 2400,
      bookSeconds: 1200,
      totalPagesRead: 150,
      totalVolumesRead: 7,
      totalMangasRead: 2,
      totalSeriesRead: 4,
      totalBooksRead: 2,
    });
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
    repo.countDistinctCompletedSeriesByUser.mockResolvedValue(0);
    repo.countDistinctCompletedBooksByUser.mockResolvedValue(0);

    const result = await service.getUserReadingStats("user-1");

    expect(result).toEqual({
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
    });
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
          coverUrl: "/manga/m-1/cover",
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
