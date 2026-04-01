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
  };

  let service: ReadingSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReadingSessionService(repo as any);
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

    const result = await service.getUserReadingStats("user-1");

    expect(result).toEqual({
      totalSeconds: 3600,
      mangaSeconds: 2400,
      bookSeconds: 1200,
    });
  });

  it("getUserReadingStats() should handle null sums", async () => {
    repo.getTotalReadingTimeByUser.mockResolvedValue({
      _sum: { durationSeconds: null },
    });
    repo.getTotalReadingTimeByUserAndType.mockResolvedValue({
      _sum: { durationSeconds: null },
    });

    const result = await service.getUserReadingStats("user-1");

    expect(result).toEqual({
      totalSeconds: 0,
      mangaSeconds: 0,
      bookSeconds: 0,
    });
  });
});
