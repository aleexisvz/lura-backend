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

  let service: MangaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MangaService(repo as any, storage as any);
  });

  it("getAllMangas() should return repository list", async () => {
    repo.findAllMangas.mockResolvedValue([{ id: "m-1", title: "One Piece" }]);

    const result = await service.getAllMangas();

    expect(repo.findAllMangas).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: "m-1", title: "One Piece" }]);
  });

  it("getMangaById() should return repository value", async () => {
    repo.findMangaById.mockResolvedValue({ id: "m-1", title: "Naruto" });

    const result = await service.getMangaById("m-1");

    expect(repo.findMangaById).toHaveBeenCalledWith("m-1");
    expect(result).toEqual({ id: "m-1", title: "Naruto" });
  });

  it("createManga() should delegate to repository", async () => {
    repo.createManga.mockResolvedValue({ id: "m-1", title: "Bleach" });

    const result = await service.createManga("Bleach", "Tite Kubo");

    expect(repo.createManga).toHaveBeenCalledWith({
      title: "Bleach",
      author: "Tite Kubo",
    });
    expect(result).toEqual({ id: "m-1", title: "Bleach" });
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
    repo.createVolume.mockResolvedValue({ id: "v-1", mangaId: "m-1", number: 2 });

    const result = await service.createVolume("m-1", 2, "Volume 2");

    expect(repo.createVolume).toHaveBeenCalledWith({
      mangaId: "m-1",
      number: 2,
      title: "Volume 2",
    });
    expect(result).toEqual({ id: "v-1", mangaId: "m-1", number: 2 });
  });

  // ── listVolumePages ──────────────────────────────────────────────

  describe("listVolumePages()", () => {
    const volume = {
      id: "v-1",
      mangaId: "m-1",
      number: 1,
      title: "Chapter 1",
      pagesCount: 3,
      status: "READY",
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
      });
      expect(result.pages).toEqual([
        { index: 1, imageUrl: "/manga/m-1/volumes/v-1/pages/1/image" },
        { index: 2, imageUrl: "/manga/m-1/volumes/v-1/pages/2/image" },
        { index: 3, imageUrl: "/manga/m-1/volumes/v-1/pages/3/image" },
      ]);
    });

    it("should throw VOLUME_NOT_FOUND when volumeId does not exist", async () => {
      repo.findVolumeById.mockResolvedValue(null);

      await expect(service.listVolumePages("m-1", "missing")).rejects.toMatchObject({
        code: "VOLUME_NOT_FOUND",
        statusCode: 404,
      });

      expect(repo.findPagesByVolume).not.toHaveBeenCalled();
    });

    it("should throw VOLUME_NOT_FOUND when volume belongs to a different manga", async () => {
      repo.findVolumeById.mockResolvedValue({ ...volume, mangaId: "other-manga" });

      await expect(service.listVolumePages("m-1", "v-1")).rejects.toMatchObject({
        code: "VOLUME_NOT_FOUND",
        statusCode: 404,
      });

      expect(repo.findPagesByVolume).not.toHaveBeenCalled();
    });
  });

  // ── streamPageImage ──────────────────────────────────────────────

  describe("streamPageImage()", () => {
    const volume = { id: "v-1", mangaId: "m-1", number: 1, status: "READY" };

    const fakeReply = () => ({
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    });

    it("should throw VOLUME_NOT_FOUND when volume does not exist", async () => {
      repo.findVolumeById.mockResolvedValue(null);
      const reply = fakeReply();

      await expect(
        service.streamPageImage(reply as any, "m-1", "missing", 1),
      ).rejects.toMatchObject({
        code: "VOLUME_NOT_FOUND",
        statusCode: 404,
      });
    });

    it("should throw VOLUME_NOT_FOUND when volume belongs to a different manga", async () => {
      repo.findVolumeById.mockResolvedValue({ ...volume, mangaId: "other-manga" });
      const reply = fakeReply();

      await expect(
        service.streamPageImage(reply as any, "m-1", "v-1", 1),
      ).rejects.toMatchObject({
        code: "VOLUME_NOT_FOUND",
        statusCode: 404,
      });
    });

    it("should throw PAGE_NOT_FOUND when page does not exist", async () => {
      repo.findVolumeById.mockResolvedValue(volume);
      repo.findPageByVolumeAndIndex.mockResolvedValue(null);
      const reply = fakeReply();

      await expect(
        service.streamPageImage(reply as any, "m-1", "v-1", 99),
      ).rejects.toMatchObject({
        code: "PAGE_NOT_FOUND",
        statusCode: 404,
      });
    });

    it("should throw PAGE_FILE_NOT_FOUND when physical file is missing", async () => {
      repo.findVolumeById.mockResolvedValue(volume);
      repo.findPageByVolumeAndIndex.mockResolvedValue({ index: 1, filename: "001.jpeg" });
      storage.resolveMangaPagePath.mockReturnValue("/fake/path/001.jpeg");
      storage.exists.mockResolvedValue(false);
      const reply = fakeReply();

      await expect(
        service.streamPageImage(reply as any, "m-1", "v-1", 1),
      ).rejects.toMatchObject({
        code: "PAGE_FILE_NOT_FOUND",
        statusCode: 404,
      });
    });

    it.each([
      ["001.jpeg", "image/jpeg"],
      ["002.jpg", "image/jpeg"],
      ["003.png", "image/png"],
      ["004.webp", "image/webp"],
      ["005.bmp", "application/octet-stream"],
    ])("should set correct Content-Type for %s", async (filename, expectedType) => {
      repo.findVolumeById.mockResolvedValue(volume);
      repo.findPageByVolumeAndIndex.mockResolvedValue({ index: 1, filename });
      storage.resolveMangaPagePath.mockReturnValue(`/fake/path/${filename}`);
      storage.exists.mockResolvedValue(true);
      storage.getFileStats.mockResolvedValue({ size: 1024, mtime: new Date("2026-01-01") });
      storage.createReadStream.mockReturnValue("fake-stream");
      const reply = fakeReply();

      await service.streamPageImage(reply as any, "m-1", "v-1", 1);

      expect(reply.header).toHaveBeenCalledWith("Content-Type", expectedType);
      expect(reply.send).toHaveBeenCalledWith("fake-stream");
    });
  });
});
