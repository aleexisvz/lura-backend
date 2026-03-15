import { beforeEach, describe, expect, it, vi } from "vitest";
import { MangaService } from "../../../src/modules/manga/manga.service.js";

describe("MangaService (unit)", () => {
  const repo = {
    getAllMangas: vi.fn(),
    findMangaById: vi.fn(),
    findVolumesByMangaId: vi.fn(),
    createManga: vi.fn(),
    createVolume: vi.fn(),
    findVolumeByMangaAndNumber: vi.fn(),
  };

  let service: MangaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MangaService(repo as any, {} as any);
  });

  it("getAllMangas() should return repository list", async () => {
    repo.getAllMangas.mockResolvedValue([{ id: "m-1", title: "One Piece" }]);

    const result = await service.getAllMangas();

    expect(repo.getAllMangas).toHaveBeenCalledTimes(1);
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
});
