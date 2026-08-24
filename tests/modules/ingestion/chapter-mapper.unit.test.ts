import { describe, it, expect } from "vitest";
import { ChapterMapper } from "../../../src/modules/ingestion/chapter-mapper.js";
import type {
  MangaDexMangaData,
  MangaDexAggregateResponse,
  MangaDexChapterData,
} from "../../../src/modules/ingestion/ingestion.types.js";

function createMockMangaData(id = "manga-uuid-1", title = "Test Manga"): MangaDexMangaData {
  return {
    id,
    type: "manga",
    attributes: {
      title: { es: title },
      altTitles: [],
      description: { es: "Descripción de prueba" },
      status: "completed",
      contentRating: "safe",
      tags: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    relationships: [],
  };
}

function createMockChapter(
  id: string,
  chapter: string,
  volume: string | null,
  lang: string,
  pages = 20
): MangaDexChapterData {
  return {
    id,
    type: "chapter",
    attributes: {
      volume,
      chapter,
      title: `Capítulo ${chapter}`,
      translatedLanguage: lang,
      externalUrl: null,
      publishAt: "2024-01-01T00:00:00Z",
      readableAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      pages,
      version: 1,
    },
    relationships: [],
  };
}

describe("ChapterMapper (unit)", () => {
  it("should return empty volumes if publication only has non-starting volumes (e.g. 5, 21, 25)", () => {
    const mangaData = createMockMangaData();
    const aggregate: MangaDexAggregateResponse = {
      result: "ok",
      volumes: {
        "5": {
          volume: "5",
          count: 1,
          chapters: { "40": { chapter: "40", id: "ch-40", others: [], count: 1 } },
        },
        "21": {
          volume: "21",
          count: 1,
          chapters: { "180": { chapter: "180", id: "ch-180", others: [], count: 1 } },
        },
        "25": {
          volume: "25",
          count: 1,
          chapters: { "220": { chapter: "220", id: "ch-220", others: [], count: 1 } },
        },
      },
    };

    const chapters = [
      createMockChapter("ch-40", "40", "5", "es"),
      createMockChapter("ch-180", "180", "21", "es"),
      createMockChapter("ch-220", "220", "25", "es"),
    ];

    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregate, chapters);

    expect(plan.volumes).toHaveLength(0);
    expect(plan.isFullySpanish).toBe(true);
    expect(plan.pendingSpanishVols).toEqual([]);
  });

  it("should return empty volumes if publication starts from volume 2 (e.g. 2, 3, 4)", () => {
    const mangaData = createMockMangaData();
    const aggregate: MangaDexAggregateResponse = {
      result: "ok",
      volumes: {
        "2": {
          volume: "2",
          count: 1,
          chapters: { "10": { chapter: "10", id: "ch-10", others: [], count: 1 } },
        },
        "3": {
          volume: "3",
          count: 1,
          chapters: { "20": { chapter: "20", id: "ch-20", others: [], count: 1 } },
        },
        "4": {
          volume: "4",
          count: 1,
          chapters: { "30": { chapter: "30", id: "ch-30", others: [], count: 1 } },
        },
      },
    };

    const chapters = [
      createMockChapter("ch-10", "10", "2", "es"),
      createMockChapter("ch-20", "20", "3", "es"),
      createMockChapter("ch-30", "30", "4", "es"),
    ];

    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregate, chapters);

    expect(plan.volumes).toHaveLength(0);
  });

  it("should only download contiguous volumes starting from 1 when there is a gap (e.g. 1, 2, 3, 17, 18, 19)", () => {
    const mangaData = createMockMangaData();
    const aggregate: MangaDexAggregateResponse = {
      result: "ok",
      volumes: {
        "1": {
          volume: "1",
          count: 1,
          chapters: { "1": { chapter: "1", id: "ch-1", others: [], count: 1 } },
        },
        "2": {
          volume: "2",
          count: 1,
          chapters: { "2": { chapter: "2", id: "ch-2", others: [], count: 1 } },
        },
        "3": {
          volume: "3",
          count: 1,
          chapters: { "3": { chapter: "3", id: "ch-3", others: [], count: 1 } },
        },
        "17": {
          volume: "17",
          count: 1,
          chapters: { "150": { chapter: "150", id: "ch-150", others: [], count: 1 } },
        },
        "18": {
          volume: "18",
          count: 1,
          chapters: { "160": { chapter: "160", id: "ch-160", others: [], count: 1 } },
        },
        "19": {
          volume: "19",
          count: 1,
          chapters: { "170": { chapter: "170", id: "ch-170", others: [], count: 1 } },
        },
      },
    };

    const chapters = [
      createMockChapter("ch-1", "1", "1", "es"),
      createMockChapter("ch-2", "2", "2", "es"),
      createMockChapter("ch-3", "3", "3", "es"),
      createMockChapter("ch-150", "150", "17", "es"),
      createMockChapter("ch-160", "160", "18", "es"),
      createMockChapter("ch-170", "170", "19", "es"),
    ];

    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregate, chapters);

    expect(plan.volumes).toHaveLength(3);
    expect(plan.volumes.map((v) => v.volumeNumber)).toEqual([1, 2, 3]);
    expect(plan.pendingSpanishVols).toEqual([]);
    expect(plan.isFullySpanish).toBe(true);
  });

  it("should retain all contiguous volumes 1, 2, 3, 4 and correctly filter pending fallback volumes beyond gaps", () => {
    const mangaData = createMockMangaData();
    const aggregate: MangaDexAggregateResponse = {
      result: "ok",
      volumes: {
        "1": {
          volume: "1",
          count: 1,
          chapters: { "1": { chapter: "1", id: "ch-1", others: [], count: 1 } },
        },
        "2": {
          volume: "2",
          count: 1,
          chapters: { "2": { chapter: "2", id: "ch-2", others: [], count: 1 } },
        },
        "3": {
          volume: "3",
          count: 1,
          chapters: { "3": { chapter: "3", id: "ch-3", others: [], count: 1 } },
        },
        "4": {
          volume: "4",
          count: 1,
          chapters: { "4": { chapter: "4", id: "ch-4", others: [], count: 1 } },
        },
        "10": {
          volume: "10",
          count: 1,
          chapters: { "80": { chapter: "80", id: "ch-80", others: [], count: 1 } },
        },
      },
    };

    const chapters = [
      createMockChapter("ch-1", "1", "1", "es"),
      createMockChapter("ch-2", "2", "2", "es"),
      createMockChapter("ch-3", "3", "3", "en"), // Fallback volume 3
      createMockChapter("ch-4", "4", "4", "es"),
      createMockChapter("ch-80", "80", "10", "en"), // Fallback volume 10 (beyond gap)
    ];

    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregate, chapters);

    expect(plan.volumes).toHaveLength(4);
    expect(plan.volumes.map((v) => v.volumeNumber)).toEqual([1, 2, 3, 4]);
    // Vol 3 is kept as fallback, Vol 10 was pruned by gap so pendingSpanishVols must ONLY have [3]
    expect(plan.pendingSpanishVols).toEqual([3]);
    expect(plan.isFullySpanish).toBe(false);
  });

  it("should not create volume 1 from unassigned chapters if they start at chapter 50", () => {
    const mangaData = createMockMangaData();
    const aggregate: MangaDexAggregateResponse = {
      result: "ok",
      volumes: {
        none: {
          volume: "none",
          count: 2,
          chapters: {
            "50": { chapter: "50", id: "ch-50", others: [], count: 1 },
            "51": { chapter: "51", id: "ch-51", others: [], count: 1 },
          },
        },
      },
    };

    const chapters = [
      createMockChapter("ch-50", "50", null, "es"),
      createMockChapter("ch-51", "51", null, "es"),
    ];

    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregate, chapters);

    expect(plan.volumes).toHaveLength(0);
  });

  it("should create volumes from unassigned chapters if they start at chapter 1", () => {
    const mangaData = createMockMangaData();
    const aggregate: MangaDexAggregateResponse = {
      result: "ok",
      volumes: {
        none: {
          volume: "none",
          count: 10,
          chapters: {},
        },
      },
    };

    const chapters = [
      createMockChapter("ch-1", "1", null, "es"),
      createMockChapter("ch-2", "2", null, "es"),
      createMockChapter("ch-3", "3", null, "es"),
    ];

    const plan = ChapterMapper.buildMangaPlan(mangaData, aggregate, chapters);

    expect(plan.volumes).toHaveLength(1);
    expect(plan.volumes[0]!.volumeNumber).toBe(1);
    expect(plan.volumes[0]!.chapters).toHaveLength(3);
  });
});
