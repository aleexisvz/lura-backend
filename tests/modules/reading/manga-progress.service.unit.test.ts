import { beforeEach, describe, expect, it, vi } from "vitest";
import { MangaProgressService } from "../../../src/modules/reading/manga-progress.service.js";

describe("MangaProgressService (unit)", () => {
  const repo = {
    findByUserAndManga: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getContinueReading: vi.fn(),
  };

  let service: MangaProgressService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MangaProgressService(repo as any);
  });

  it("getProgress() should return null when no progress exists", async () => {
    repo.findByUserAndManga.mockResolvedValue(null);

    const result = await service.getProgress("user-1", "manga-1");

    expect(repo.findByUserAndManga).toHaveBeenCalledWith("user-1", "manga-1");
    expect(result).toBeNull();
  });

  it("getProgress() should return formatted progress", async () => {
    repo.findByUserAndManga.mockResolvedValue({
      id: "prog-1",
      mangaId: "manga-1",
      volumeId: "vol-1",
      page: 15,
      updatedAt: new Date("2026-03-01"),
    });

    const result = await service.getProgress("user-1", "manga-1");

    expect(result).toEqual({
      mangaId: "manga-1",
      volumeId: "vol-1",
      page: 15,
      updatedAt: new Date("2026-03-01"),
    });
  });

  it("updateProgress() should create new progress when none exists", async () => {
    repo.findByUserAndManga.mockResolvedValue(null);
    repo.create.mockResolvedValue({
      id: "prog-1",
      userId: "user-1",
      mangaId: "manga-1",
      volumeId: "vol-1",
      page: 5,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-1", 5);

    expect(repo.create).toHaveBeenCalledWith({
      userId: "user-1",
      mangaId: "manga-1",
      volumeId: "vol-1",
      page: 5,
    });
    expect(result.page).toBe(5);
  });

  it("updateProgress() should not go backward on same volume", async () => {
    repo.findByUserAndManga.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-1",
      page: 10,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-1", 5);

    expect(repo.update).not.toHaveBeenCalled();
    expect(result.page).toBe(10);
  });

  it("updateProgress() should not update when same page on same volume", async () => {
    repo.findByUserAndManga.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-1",
      page: 10,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-1", 10);

    expect(repo.update).not.toHaveBeenCalled();
    expect(result.page).toBe(10);
  });

  it("updateProgress() should update when page advances on same volume", async () => {
    repo.findByUserAndManga.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-1",
      page: 5,
    });
    repo.update.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-1",
      page: 15,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-1", 15);

    expect(repo.update).toHaveBeenCalledWith("prog-1", {
      volumeId: "vol-1",
      page: 15,
    });
    expect(result.page).toBe(15);
  });

  it("updateProgress() should update when volume changes", async () => {
    repo.findByUserAndManga.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-1",
      page: 50,
    });
    repo.update.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-2",
      page: 1,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-2", 1);

    expect(repo.update).toHaveBeenCalledWith("prog-1", {
      volumeId: "vol-2",
      page: 1,
    });
    expect(result.page).toBe(1);
  });

  it("getContinueReading() should delegate to repository", async () => {
    repo.getContinueReading.mockResolvedValue([
      { mangaId: "m-1", page: 5 },
      { mangaId: "m-2", page: 10 },
    ]);

    const result = await service.getContinueReading("user-1");

    expect(repo.getContinueReading).toHaveBeenCalledWith("user-1");
    expect(result).toHaveLength(2);
  });
});
