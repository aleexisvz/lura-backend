import { beforeEach, describe, expect, it, vi } from "vitest";
import { MangaService } from "../../../src/modules/manga/manga.service.js";

describe("MangaService (unit)", () => {
  const repo = {
    findAllMangas: vi.fn(),
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
    resolveMangaPagePath: vi.fn(),
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

    await expect(service.createManga("Bleach", "Tite Kubo", ["t-book"])).rejects.toMatchObject({
      code: "TAG_SCOPE_MISMATCH",
      statusCode: 400,
    });
  });

  it("createVolume() should fail when manga does not exist", async () => {
    repo.findMangaById.mockResolvedValue(null);

    await expect(service.createVolume("missing-manga", 1)).rejects.toMatchObject({
      code: "MANGA_NOT_FOUND",
      statusCode: 404,
    });

    expect(repo.findVolumeByMangaAndNumber).not.toHaveBeenCalled();
    expect(repo.createVolume).not.toHaveBeenCalled();
  });

  it("createVolume() should fail when volume number is duplicated", async () => {
    repo.findMangaById.mockResolvedValue({ id: "m-1" });
    repo.findVolumeByMangaAndNumber.mockResolvedValue({ id: "v-1", number: 1 });

    await expect(service.createVolume("m-1", 1)).rejects.toMatchObject({
      code: "VOLUME_NUMBER_DUPLICATE",
      statusCode: 409,
    });

    expect(repo.createVolume).not.toHaveBeenCalled();
  });

  it("createVolume() should create a new volume when valid", async () => {
    repo.findMangaById.mockResolvedValue({ id: "m-1" });
    repo.findVolumeByMangaAndNumber.mockResolvedValue(null);
    repo.createVolume.mockResolvedValue({
      id: "v-1",
      mangaId: "m-1",
      number: 2,
      title: "Volume 2",
      status: "UPLOADING",
      pagesCount: 0,
      coverPath: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await service.createVolume("m-1", 2, "Volume 2");

    expect(repo.createVolume).toHaveBeenCalledWith({
      mangaId: "m-1",
      number: 2,
      title: "Volume 2",
    });
    expect(result).toEqual(expect.objectContaining({ id: "v-1", mangaId: "m-1", number: 2 }));
  });

  describe("listVolumePages()", () => {
    const volume = {
      id: "v-1",
      mangaId: "m-1",
      number: 1,
      title: "Chapter 1",
      pagesCount: 3,
      status: "READY",
      coverPath: null,
    };

    it("should return pages sorted by index with correct imageUrl", async () => {
      repo.findVolumeById.mockResolvedValue(volume);
      repo.findPagesByVolume.mockResolvedValue([
        { index: 1, filename: "001.jpeg" },
        { index: 2, filename: "002.jpeg" },
        { index: 3, filename: "003.jpeg" },
      ]);

      const result = await service.listVolumePages("m-1", "v-1");

      expect(result.volume).toEqual({
        id: "v-1",
        number: 1,
        title: "Chapter 1",
        pagesCount: 3,
        status: "READY",
        coverUrl: null,
      });
      expect(result.pages).toEqual([
        { index: 1, imageUrl: "/manga/m-1/volumes/v-1/pages/1/image" },
        { index: 2, imageUrl: "/manga/m-1/volumes/v-1/pages/2/image" },
        { index: 3, imageUrl: "/manga/m-1/volumes/v-1/pages/3/image" },
      ]);
    });
  });

  describe("streamPageImage()", () => {
    const volume = { id: "v-1", mangaId: "m-1", number: 1, status: "READY" };

    const fakeReply = () => ({
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    });

    it("should throw PAGE_NOT_FOUND when page does not exist", async () => {
      repo.findVolumeById.mockResolvedValue(volume);
      repo.findPageByVolumeAndIndex.mockResolvedValue(null);
      const reply = fakeReply();

      await expect(
        service.streamPageImage(reply as any, "m-1", "v-1", 99)
      ).rejects.toMatchObject({
        code: "PAGE_NOT_FOUND",
        statusCode: 404,
      });
    });
  });
});
