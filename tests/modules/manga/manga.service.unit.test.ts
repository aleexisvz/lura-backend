import { beforeEach, describe, expect, it, vi } from "vitest";
import { MangaService } from "../../../src/modules/manga/manga.service.js";

describe("MangaService (unit)", () => {
  const repo = {
    findAllMangas: vi.fn(),
    findFeaturedMangas: vi.fn(),
    findRecentUpdates: vi.fn(),
    findTopRankings: vi.fn(),
    findMangaById: vi.fn(),
    findVolumesByMangaId: vi.fn(),
    createManga: vi.fn(),
    createVolume: vi.fn(),
    findVolumeByMangaAndNumber: vi.fn(),
    findVolumeById: vi.fn(),
    findPagesByVolume: vi.fn(),
    findPageByVolumeAndIndex: vi.fn(),
  };

  const storage = {
    resolveMangaPagePath: vi.fn((mangaId: string, volumeId: string, filename: string) => `manga/${mangaId}/volumes/${volumeId}/pages/${filename}`),
    getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
    exists: vi.fn(),
    getFileStats: vi.fn(),
    createReadStream: vi.fn(),
  };

  const tagsRepo = {
    findByIds: vi.fn(),
  };

  let service: MangaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MangaService(repo as any, storage as any, tagsRepo as any);
  });

  it("getAllMangas() should return repository list", async () => {
    repo.findAllMangas.mockResolvedValue([
      {
        id: "m-1",
        title: "One Piece",
        titleKanji: null,
        author: "Eiichiro Oda",
        description: null,
        coverPath: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        mangaTags: [],
      },
    ]);

    const result = await service.getAllMangas();

    expect(repo.findAllMangas).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({ id: "m-1", title: "One Piece", categories: [] }),
    ]);
  });

  it("getFeatured() should return featured mangas with latest volume", async () => {
    repo.findFeaturedMangas.mockResolvedValue([
      {
        id: "m-1",
        title: "Jujutsu Kaisen",
        titleKanji: "呪術廻戦",
        author: "Gege Akutami",
        description: "Action manga",
        coverPath: "covers/jjk.webp",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        mangaTags: [],
        volumes: [
          {
            id: "v-1",
            mangaId: "m-1",
            number: 24,
            title: "Vol. 24",
            coverPath: null,
            status: "READY",
            pagesCount: 190,
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
          },
        ],
      },
    ]);

    const result = await service.getFeatured(5);

    expect(repo.findFeaturedMangas).toHaveBeenCalledWith(5);
    expect(result[0]?.title).toBe("Jujutsu Kaisen");
    expect(result[0]?.latestVolume?.number).toBe(24);
  });

  it("getRecentUpdates() should return updated mangas", async () => {
    repo.findRecentUpdates.mockResolvedValue([
      {
        id: "m-1",
        title: "My Hero Academia",
        titleKanji: "僕のヒーローアカデミア",
        author: "Kohei Horikoshi",
        description: null,
        coverPath: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        mangaTags: [],
        volumes: [],
      },
    ]);

    const result = await service.getRecentUpdates(12);

    expect(repo.findRecentUpdates).toHaveBeenCalledWith(12);
    expect(result[0]?.title).toBe("My Hero Academia");
  });

  it("getRankings() should return ranked mangas with positions", async () => {
    repo.findTopRankings.mockResolvedValue([
      {
        manga: {
          id: "m-1",
          title: "Chainsaw Man",
          titleKanji: "チェンソーマン",
          author: "Tatsuki Fujimoto",
          description: null,
          coverPath: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          mangaTags: [],
          volumes: [],
        },
        readersCount: 42,
      },
    ]);

    const result = await service.getRankings(10);

    expect(repo.findTopRankings).toHaveBeenCalledWith(10);
    expect(result[0]?.rank).toBe(1);
    expect(result[0]?.readersCount).toBe(42);
    expect(result[0]?.manga.title).toBe("Chainsaw Man");
  });

  it("getMangaById() should return repository value", async () => {
    repo.findMangaById.mockResolvedValue({
      id: "m-1",
      title: "Naruto",
      titleKanji: "ナルト",
      author: null,
      description: null,
      coverPath: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      mangaTags: [],
    });

    const result = await service.getMangaById("m-1");

    expect(repo.findMangaById).toHaveBeenCalledWith("m-1");
    expect(result).toEqual(expect.objectContaining({ id: "m-1", title: "Naruto" }));
  });

  it("createManga() should delegate to repository", async () => {
    repo.createManga.mockResolvedValue({
      id: "m-1",
      title: "Bleach",
      titleKanji: "ブリーチ",
      author: "Tite Kubo",
      description: null,
      coverPath: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      mangaTags: [],
    });

    const result = await service.createManga("Bleach", "Tite Kubo");

    expect(repo.createManga).toHaveBeenCalledWith({
      title: "Bleach",
      author: "Tite Kubo",
      tagIds: [],
    });
    expect(result).toEqual(expect.objectContaining({ id: "m-1", title: "Bleach" }));
  });

  it("createManga() should reject BOOK tags", async () => {
    tagsRepo.findByIds.mockResolvedValue([
      { id: "t-book", scope: "BOOK", name: "Fantasy", slug: "fantasy" },
    ]);

    await expect(service.createManga("Manga", undefined, ["t-book"])).rejects.toMatchObject({
      code: "TAG_SCOPE_MISMATCH",
      statusCode: 400,
    });
  });

  describe("listVolumePages()", () => {
    const volume = {
      id: "v-1",
      mangaId: "m-1",
      number: 1,
      title: "Chapter 1",
      status: "READY",
      pagesCount: 3,
      coverPath: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    it("should return pages sorted by index with correct imageUrl", async () => {
      repo.findVolumeById.mockResolvedValue(volume);
      repo.findPagesByVolume.mockResolvedValue([
        { index: 1, filename: "001.webp" },
        { index: 2, filename: "002.webp" },
        { index: 3, filename: "003.webp" },
      ]);

      const result = await service.listVolumePages("m-1", "v-1");

      expect(result.volume).toEqual({
        id: "v-1",
        number: 1,
        title: "Chapter 1",
        pagesCount: 3,
        status: "READY",
        coverUrl: null,
        language: "ES",
        isFallback: false,
        version: 1,
      });
      expect(result.pages).toEqual([
        { index: 1, imageUrl: "https://cdn.example.com/manga/m-1/volumes/v-1/pages/001.webp" },
        { index: 2, imageUrl: "https://cdn.example.com/manga/m-1/volumes/v-1/pages/002.webp" },
        { index: 3, imageUrl: "https://cdn.example.com/manga/m-1/volumes/v-1/pages/003.webp" },
      ]);
    });
  });
});
