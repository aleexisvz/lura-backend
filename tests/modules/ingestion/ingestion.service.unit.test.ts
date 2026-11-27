import { describe, it, expect, vi, beforeEach } from "vitest";
import { IngestionService } from "../../../src/modules/ingestion/ingestion.service.js";
import { MangaDexClient } from "../../../src/modules/ingestion/mangadex.client.js";
import { IngestionRepository } from "../../../src/modules/ingestion/ingestion.repository.js";
import { CloudStorageService } from "../../../src/infrastructure/storage/CloudStorageService.js";
import { AppError } from "../../../src/shared/errors/AppError.js";

describe("IngestionService (unit)", () => {
  let mangadexMock: any;
  let repoMock: any;
  let storageMock: any;
  let service: IngestionService;

  beforeEach(() => {
    mangadexMock = {
      searchMangaByTitle: vi.fn(),
      getManga: vi.fn(),
      getAggregate: vi.fn(),
      getChapters: vi.fn(),
      downloadImageBuffer: vi.fn(),
      getAtHomeServer: vi.fn(),
    };

    repoMock = {
      findMangaByExternalId: vi.fn(),
      findMangaByTitle: vi.fn(),
      createManga: vi.fn(),
      updateMangaMetadata: vi.fn(),
      syncMangaTags: vi.fn(),
      updateMangaCover: vi.fn(),
      findVolumeByMangaAndNumber: vi.fn(),
      createVolume: vi.fn(),
      updateVolume: vi.fn(),
      deletePagesByVolumeId: vi.fn(),
      createPages: vi.fn(),
      upsertTracker: vi.fn(),
    };

    storageMock = {
      resolveMangaCoverPath: vi.fn().mockReturnValue("manga/1/cover.webp"),
      resolveVolumeCoverPath: vi.fn().mockReturnValue("manga/1/volume/1/cover.webp"),
      resolveMangaPagePath: vi.fn().mockReturnValue("manga/1/volume/1/pages/001.webp"),
      saveStream: vi.fn().mockResolvedValue(undefined),
    };

    service = new IngestionService(
      mangadexMock as unknown as MangaDexClient,
      repoMock as unknown as IngestionRepository,
      storageMock as unknown as CloudStorageService
    );
  });

  it("should throw AppError with VALIDATION_ERROR when manga has no Volume 1 available (0 volumes in plan)", async () => {
    mangadexMock.getManga.mockResolvedValue({
      id: "uuid-gap-manga",
      type: "manga",
      attributes: {
        title: { es: "Manga Incompleto" },
        altTitles: [],
        description: { es: "Desc" },
        status: "completed",
        contentRating: "safe",
        tags: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      relationships: [],
    });

    // Aggregate with only volumes 21, 25 (volume 1 missing)
    mangadexMock.getAggregate.mockResolvedValue({
      result: "ok",
      volumes: {
        "21": {
          volume: "21",
          count: 1,
          chapters: { "200": { chapter: "200", id: "ch-200", others: [], count: 1 } },
        },
      },
    });

    mangadexMock.getChapters.mockResolvedValue([
      {
        id: "ch-200",
        type: "chapter",
        attributes: {
          volume: "21",
          chapter: "200",
          title: "Cap 200",
          translatedLanguage: "es",
          externalUrl: null,
          pages: 20,
          publishAt: "2024-01-01T00:00:00Z",
          readableAt: "2024-01-01T00:00:00Z",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          version: 1,
        },
        relationships: [],
      },
    ]);

    await expect(service.ingest("a77742b1-befd-49a4-bff5-1ad4e6b0ef7b")).rejects.toThrow(
      AppError
    );

    // Ensure manga record is NOT created in database
    expect(repoMock.createManga).not.toHaveBeenCalled();
    expect(repoMock.upsertTracker).not.toHaveBeenCalled();
  });

  describe("processVolume page versions", () => {
    const volPlan = {
      volumeNumber: 1,
      volumeTitle: "Tomo 1",
      language: "ES",
      isFallback: false,
      chapters: [{ id: "ch-1", chapterNumber: "1" }],
    } as any;

    beforeEach(async () => {
      const sharp = (await import("sharp")).default;
      const image = await sharp({
        create: { width: 20, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .png()
        .toBuffer();
      mangadexMock.getAtHomeServer.mockResolvedValue({
        baseUrl: "https://cdn.example",
        chapter: { hash: "h", data: ["a.png"] },
      });
      mangadexMock.downloadImageBuffer.mockResolvedValue(image);
    });

    it("gives a volume whose pages are replaced a new version, so the page URLs change", async () => {
      repoMock.findVolumeByMangaAndNumber.mockResolvedValue({
        id: "v1",
        status: "READY",
        pagesCount: 12,
        language: "EN",
        isFallback: true,
        version: 1,
      });

      await service.processVolume("m1", volPlan, "ext", undefined, { force: true });

      expect(repoMock.updateVolume).toHaveBeenCalledWith(
        "v1",
        expect.objectContaining({ status: "READY", version: 2 })
      );
    });

    it("keeps the first version for a volume that had no pages yet", async () => {
      repoMock.findVolumeByMangaAndNumber.mockResolvedValue(null);
      repoMock.createVolume.mockResolvedValue({ id: "v1", pagesCount: 0, version: 1 });

      await service.processVolume("m1", volPlan, "ext");

      const update = repoMock.updateVolume.mock.calls[0][1];
      expect(update).not.toHaveProperty("version");
    });
  });
});
