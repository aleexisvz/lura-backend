import { describe, it, expect, vi, beforeEach } from "vitest";
import { WatcherService } from "../../../src/modules/ingestion/watcher.service.js";
import { MangaDexClient } from "../../../src/modules/ingestion/mangadex.client.js";
import { IngestionRepository } from "../../../src/modules/ingestion/ingestion.repository.js";
import { IngestionService } from "../../../src/modules/ingestion/ingestion.service.js";
import { CloudStorageService } from "../../../src/infrastructure/storage/CloudStorageService.js";

describe("WatcherService (unit)", () => {
  let mangadexMock: any;
  let repoMock: any;
  let ingestionServiceMock: any;
  let storageMock: any;
  let watcher: WatcherService;

  beforeEach(() => {
    mangadexMock = {
      getManga: vi.fn(),
      getAggregate: vi.fn(),
      getChapters: vi.fn(),
    };

    repoMock = {
      findAllTrackers: vi.fn(),
      findActiveTrackers: vi.fn(),
      findVolumeByMangaAndNumber: vi.fn(),
      updateVolume: vi.fn(),
      clampReadingProgress: vi.fn(),
      updateMangaMetadata: vi.fn(),
      updateTrackerStatus: vi.fn(),
      deleteVolume: vi.fn().mockResolvedValue(undefined),
      deleteManga: vi.fn().mockResolvedValue(undefined),
    };

    ingestionServiceMock = {
      processVolume: vi.fn().mockResolvedValue(undefined),
    };

    storageMock = {
      deleteMangaFiles: vi.fn().mockResolvedValue(undefined),
      deleteVolumeFiles: vi.fn().mockResolvedValue(undefined),
    };

    watcher = new WatcherService(
      mangadexMock as unknown as MangaDexClient,
      repoMock as unknown as IngestionRepository,
      ingestionServiceMock as unknown as IngestionService,
      storageMock as unknown as CloudStorageService
    );
  });

  it("should audit and delete manga if it was created without Volume 1 (e.g. only has 2, 3, 4)", async () => {
    repoMock.findAllTrackers.mockResolvedValue([
      {
        id: "tracker-invalid",
        mangaId: "manga-invalid",
        externalMangaId: "ext-inv",
        status: "COMPLETED",
        pendingSpanishVols: [],
        Manga: {
          id: "manga-invalid",
          title: "Manga Invalido",
          volumes: [
            { id: "v-2", number: 2 },
            { id: "v-3", number: 3 },
            { id: "v-4", number: 4 },
          ],
        },
      },
    ]);

    const result = await watcher.checkAndPatch();

    expect(result.checkedTrackers).toBe(1);
    expect(result.actions).toEqual([
      {
        mangaTitle: "Manga Invalido",
        mangaId: "manga-invalid",
        type: "DELETED_INVALID_MANGA",
      },
    ]);

    expect(storageMock.deleteMangaFiles).toHaveBeenCalledWith("manga-invalid");
    expect(repoMock.deleteManga).toHaveBeenCalledWith("manga-invalid");
    expect(mangadexMock.getManga).not.toHaveBeenCalled();
  });

  it("should audit and purge disconnected volumes (e.g. 5, 19 when DB has 1, 2, 5, 19)", async () => {
    repoMock.findAllTrackers.mockResolvedValue([
      {
        id: "tracker-gap",
        mangaId: "manga-gap",
        externalMangaId: "ext-gap",
        status: "COMPLETED",
        pendingSpanishVols: [],
        Manga: {
          id: "manga-gap",
          title: "Manga Con Gaps",
          volumes: [
            { id: "v-1", number: 1 },
            { id: "v-2", number: 2 },
            { id: "v-5", number: 5 },
            { id: "v-19", number: 19 },
          ],
        },
      },
    ]);

    // MangaDex only has contiguous volumes 1 and 2
    mangadexMock.getManga.mockResolvedValue({
      id: "ext-gap",
      type: "manga",
      attributes: {
        title: { es: "Manga Con Gaps" },
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

    mangadexMock.getAggregate.mockResolvedValue({
      result: "ok",
      volumes: {
        "1": { volume: "1", count: 1, chapters: { "1": { chapter: "1", id: "c-1", others: [], count: 1 } } },
        "2": { volume: "2", count: 1, chapters: { "2": { chapter: "2", id: "c-2", others: [], count: 1 } } },
        "5": { volume: "5", count: 1, chapters: { "50": { chapter: "50", id: "c-50", others: [], count: 1 } } },
      },
    });

    mangadexMock.getChapters.mockResolvedValue([
      { id: "c-1", type: "chapter", attributes: { volume: "1", chapter: "1", pages: 20, translatedLanguage: "es" }, relationships: [] },
      { id: "c-2", type: "chapter", attributes: { volume: "2", chapter: "2", pages: 20, translatedLanguage: "es" }, relationships: [] },
      { id: "c-50", type: "chapter", attributes: { volume: "5", chapter: "50", pages: 20, translatedLanguage: "es" }, relationships: [] },
    ]);

    const result = await watcher.checkAndPatch();

    // Volumes 5 and 19 were purged
    expect(storageMock.deleteVolumeFiles).toHaveBeenCalledWith("manga-gap", "v-5");
    expect(repoMock.deleteVolume).toHaveBeenCalledWith("v-5");
    expect(storageMock.deleteVolumeFiles).toHaveBeenCalledWith("manga-gap", "v-19");
    expect(repoMock.deleteVolume).toHaveBeenCalledWith("v-19");

    expect(result.actions).toEqual([
      { mangaTitle: "Manga Con Gaps", mangaId: "manga-gap", volumeNumber: 5, type: "DELETED_DISCONNECTED_VOLUME" },
      { mangaTitle: "Manga Con Gaps", mangaId: "manga-gap", volumeNumber: 19, type: "DELETED_DISCONNECTED_VOLUME" },
    ]);
  });

  it("should detect and download new contiguous volumes when released (e.g. volumes 4 & 5 when DB has 1..3)", async () => {
    // Manga in DB has volumes 1, 2, 3
    repoMock.findAllTrackers.mockResolvedValue([
      {
        id: "tracker-1",
        mangaId: "manga-1",
        externalMangaId: "ext-1",
        status: "COMPLETED",
        pendingSpanishVols: [],
        Manga: {
          id: "manga-1",
          title: "Berserk",
          volumes: [
            { id: "vol-1", number: 1 },
            { id: "vol-2", number: 2 },
            { id: "vol-3", number: 3 },
          ],
        },
      },
    ]);

    // MangaDex now has volumes 1, 2, 3, 4, 5 in Spanish
    mangadexMock.getManga.mockResolvedValue({
      id: "ext-1",
      type: "manga",
      attributes: {
        title: { es: "Berserk" },
        altTitles: [],
        description: { es: "Guts story" },
        status: "ongoing",
        contentRating: "safe",
        tags: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      relationships: [],
    });

    mangadexMock.getAggregate.mockResolvedValue({
      result: "ok",
      volumes: {
        "1": { volume: "1", count: 1, chapters: { "1": { chapter: "1", id: "c-1", others: [], count: 1 } } },
        "2": { volume: "2", count: 1, chapters: { "2": { chapter: "2", id: "c-2", others: [], count: 1 } } },
        "3": { volume: "3", count: 1, chapters: { "3": { chapter: "3", id: "c-3", others: [], count: 1 } } },
        "4": { volume: "4", count: 1, chapters: { "4": { chapter: "4", id: "c-4", others: [], count: 1 } } },
        "5": { volume: "5", count: 1, chapters: { "5": { chapter: "5", id: "c-5", others: [], count: 1 } } },
      },
    });

    mangadexMock.getChapters.mockResolvedValue([
      { id: "c-1", type: "chapter", attributes: { volume: "1", chapter: "1", pages: 20, translatedLanguage: "es" }, relationships: [] },
      { id: "c-2", type: "chapter", attributes: { volume: "2", chapter: "2", pages: 20, translatedLanguage: "es" }, relationships: [] },
      { id: "c-3", type: "chapter", attributes: { volume: "3", chapter: "3", pages: 20, translatedLanguage: "es" }, relationships: [] },
      { id: "c-4", type: "chapter", attributes: { volume: "4", chapter: "4", pages: 20, translatedLanguage: "es" }, relationships: [] },
      { id: "c-5", type: "chapter", attributes: { volume: "5", chapter: "5", pages: 20, translatedLanguage: "es" }, relationships: [] },
    ]);

    const result = await watcher.checkAndPatch();

    expect(result.checkedTrackers).toBe(1);
    expect(result.actions).toEqual([
      { mangaTitle: "Berserk", mangaId: "manga-1", volumeNumber: 4, type: "NEW_VOLUME" },
      { mangaTitle: "Berserk", mangaId: "manga-1", volumeNumber: 5, type: "NEW_VOLUME" },
    ]);

    // processVolume should have been called for vol 4 and 5
    expect(ingestionServiceMock.processVolume).toHaveBeenCalledTimes(2);
  });
});
