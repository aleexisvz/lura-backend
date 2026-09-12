import { beforeEach, describe, expect, it, vi } from "vitest";
import { MangaProgressService } from "../../../src/modules/reading/manga-progress.service.js";

describe("MangaProgressService (unit)", () => {
  const repo = {
    findLatestByUserAndManga: vi.fn(),
    findByUserAndMangaAndVolume: vi.fn(),
    findMangaById: vi.fn(),
    findVolumeById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getContinueReading: vi.fn(),
    findMangasByIds: vi.fn(),
    findVolumesByIds: vi.fn(),
  };

  const completionRepo = {
    findByUserAndVolume: vi.fn(),
    findVolumeIdsByUser: vi.fn(),
    deactivateByUserAndVolume: vi.fn(),
    isMangaCompleted: vi.fn(),
  };

  const storage = {
    getPublicUrl: vi.fn((path: string) => `https://cdn.example.com/${path}`),
  };

  let service: MangaProgressService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MangaProgressService(repo as any, completionRepo as any, storage as any);
    repo.findMangaById.mockResolvedValue({ id: "manga-1" });
    repo.findVolumeById.mockResolvedValue({
      id: "vol-1",
      mangaId: "manga-1",
      pagesCount: 100,
    });
    completionRepo.findByUserAndVolume.mockResolvedValue(null);
    completionRepo.findVolumeIdsByUser.mockResolvedValue([]);
    completionRepo.deactivateByUserAndVolume.mockResolvedValue({ count: 0 });
    completionRepo.isMangaCompleted.mockResolvedValue(false);
  });

  it("getProgress() should return null when no progress exists", async () => {
    repo.findLatestByUserAndManga.mockResolvedValue(null);

    const result = await service.getProgress("user-1", "manga-1");

    expect(repo.findLatestByUserAndManga).toHaveBeenCalledWith("user-1", "manga-1");
    expect(result).toBeNull();
  });

  it("getProgress() should return formatted progress", async () => {
    repo.findLatestByUserAndManga.mockResolvedValue({
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
      volumeCompleted: false,
      completed: false,
    });
  });

  it("getProgress() should return completed: true when manga is fully completed", async () => {
    repo.findLatestByUserAndManga.mockResolvedValue({
      id: "prog-1",
      mangaId: "manga-1",
      volumeId: "vol-1",
      page: 100,
      updatedAt: new Date("2026-03-01"),
    });
    completionRepo.findByUserAndVolume.mockResolvedValue({ isActive: true });
    completionRepo.isMangaCompleted.mockResolvedValue(true);

    const result = await service.getProgress("user-1", "manga-1");

    expect(result).toEqual({
      mangaId: "manga-1",
      volumeId: "vol-1",
      page: 100,
      updatedAt: new Date("2026-03-01"),
      volumeCompleted: true,
      completed: true,
    });
  });

  it("updateProgress() should create a volume progress when none exists", async () => {
    repo.findByUserAndMangaAndVolume.mockResolvedValue(null);
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
    repo.findByUserAndMangaAndVolume.mockResolvedValue({
      id: "prog-1",
      page: 10,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-1", 5);

    expect(repo.update).not.toHaveBeenCalled();
    expect(result.page).toBe(10);
  });

  it("updateProgress() should update when page advances on same volume", async () => {
    repo.findByUserAndMangaAndVolume.mockResolvedValue({
      id: "prog-1",
      page: 5,
    });
    repo.update.mockResolvedValue({
      id: "prog-1",
      volumeId: "vol-1",
      page: 15,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-1", 15);

    expect(repo.update).toHaveBeenCalledWith("prog-1", { page: 15 });
    expect(result.page).toBe(15);
  });

  it("updateProgress() should create independent progress for another volume", async () => {
    repo.findByUserAndMangaAndVolume.mockResolvedValue(null);
    repo.create.mockResolvedValue({
      id: "prog-2",
      userId: "user-1",
      mangaId: "manga-1",
      volumeId: "vol-2",
      page: 1,
    });

    const result = await service.updateProgress("user-1", "manga-1", "vol-2", 1);

    expect(repo.create).toHaveBeenCalledWith({
      userId: "user-1",
      mangaId: "manga-1",
      volumeId: "vol-2",
      page: 1,
    });
    expect(result.volumeId).toBe("vol-2");
  });

  it("updateProgress() should throw MANGA_NOT_FOUND when manga does not exist", async () => {
    repo.findMangaById.mockResolvedValue(null);

    await expect(service.updateProgress("user-1", "manga-x", "vol-1", 5)).rejects.toMatchObject({
      code: "MANGA_NOT_FOUND",
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("updateProgress() should throw VOLUME_NOT_FOUND when volume does not exist", async () => {
    repo.findVolumeById.mockResolvedValue(null);

    await expect(service.updateProgress("user-1", "manga-1", "vol-x", 5)).rejects.toMatchObject({
      code: "VOLUME_NOT_FOUND",
    });
  });

  it("updateProgress() should throw PAGE_OUT_OF_RANGE when page exceeds pagesCount", async () => {
    repo.findVolumeById.mockResolvedValue({ id: "vol-1", mangaId: "manga-1", pagesCount: 20 });

    await expect(service.updateProgress("user-1", "manga-1", "vol-1", 21)).rejects.toMatchObject({
      code: "PAGE_OUT_OF_RANGE",
    });
  });

  it("getContinueReading() should apply completion filter and enrichment", async () => {
    completionRepo.findVolumeIdsByUser.mockResolvedValue(["vol-completed"]);
    repo.getContinueReading.mockResolvedValue([
      { mangaId: "manga-1", volumeId: "vol-1", page: 15, updatedAt: new Date("2026-05-18T10:00:00Z") },
      { mangaId: "manga-1", volumeId: "vol-short", page: 1, updatedAt: new Date("2026-05-18T09:00:00Z") },
      { mangaId: "manga-2", volumeId: "vol-low", page: 10, updatedAt: new Date("2026-05-18T08:00:00Z") },
    ]);
    repo.findMangasByIds.mockResolvedValue([
      { id: "manga-1", title: "Manga One", coverPath: "manga/1/cover.jpg" },
      { id: "manga-2", title: "Manga Two", coverPath: null },
    ]);
    repo.findVolumesByIds.mockResolvedValue([
      {
        id: "vol-1",
        mangaId: "manga-1",
        number: 3,
        title: "Vol 3",
        pagesCount: 30,
        status: "READY",
        coverPath: "manga/1/vol/3/cover.jpg",
      },
      {
        id: "vol-short",
        mangaId: "manga-1",
        number: 1,
        title: "Vol 1",
        pagesCount: 12,
        status: "READY",
        coverPath: null,
      },
      {
        id: "vol-low",
        mangaId: "manga-2",
        number: 2,
        title: "Vol 2",
        pagesCount: 40,
        status: "READY",
        coverPath: null,
      },
    ]);

    const result = await service.getContinueReading("user-1");

    expect(repo.getContinueReading).toHaveBeenCalledWith("user-1", 60);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      mangaId: "manga-1",
      volumeId: "vol-1",
      pageNumber: 15,
      mangaTitle: "Manga One",
      progressPercent: 50,
      coverUrl: "https://cdn.example.com/manga/1/vol/3/cover.jpg",
    });
    expect(result[1]).toMatchObject({
      volumeId: "vol-short",
      pageNumber: 1,
      progressPercent: 8,
      coverUrl: "https://cdn.example.com/manga/1/cover.jpg",
    });
    expect(result[2]).toMatchObject({
      volumeId: "vol-low",
      pageNumber: 10,
      progressPercent: 25,
    });
  });
});
