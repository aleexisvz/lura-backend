import type { ContentLanguage, IngestionStatus } from "@prisma/client";

export interface MangaDexRelationship {
  id: string;
  type: string;
  related?: string;
  attributes?: Record<string, any>;
}

export interface MangaDexMangaAttributes {
  title: Record<string, string>;
  altTitles: Array<Record<string, string>>;
  description: Record<string, string>;
  status: "ongoing" | "completed" | "hiatus" | "cancelled";
  year?: number;
  contentRating: string;
  publicationDemographic?: "shounen" | "seinen" | "shoujo" | "josei" | null;
  tags: Array<{
    id: string;
    type: string;
    attributes: {
      name: Record<string, string>;
      group: string;
    };
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface MangaDexMangaData {
  id: string;
  type: "manga";
  attributes: MangaDexMangaAttributes;
  relationships: MangaDexRelationship[];
}

export interface MangaDexAggregateChapter {
  chapter: string;
  id: string;
  others: string[];
  count: number;
}

export interface MangaDexAggregateVolume {
  volume: string;
  count: number;
  chapters: Record<string, MangaDexAggregateChapter>;
}

export interface MangaDexAggregateResponse {
  result: string;
  volumes: Record<string, MangaDexAggregateVolume>;
}

export interface MangaDexChapterAttributes {
  volume: string | null;
  chapter: string | null;
  title: string | null;
  translatedLanguage: string;
  externalUrl: string | null;
  publishAt: string;
  readableAt: string;
  createdAt: string;
  updatedAt: string;
  pages: number;
  version: number;
}

export interface MangaDexChapterData {
  id: string;
  type: "chapter";
  attributes: MangaDexChapterAttributes;
  relationships: MangaDexRelationship[];
}

export interface MangaDexAtHomeResponse {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

export interface ChapterPlan {
  id: string;
  chapterNumber: string;
  title: string | null;
  language: string;
  pagesCount: number;
}

export interface VolumePlan {
  volumeNumber: number;
  volumeTitle: string | null;
  language: ContentLanguage;
  isFallback: boolean;
  chapters: ChapterPlan[];
}

export interface MangaPlan {
  externalId: string;
  title: string;
  titleKanji: string | null;
  author: string | null;
  description: string | null;
  status: "EN_EMISION" | "FINALIZADO";
  coverFileName: string | null;
  demographic: string | null;
  tags: string[];
  volumes: VolumePlan[];
  pendingSpanishVols: number[];
  isFullySpanish: boolean;
}

export interface DryRunSummary {
  mangaTitle: string;
  externalId: string;
  author: string | null;
  status: "EN_EMISION" | "FINALIZADO";
  demographic: string | null;
  tags: string[];
  totalVolumes: number;
  spanishVolumesCount: number;
  fallbackVolumesCount: number;
  fallbackVolumeNumbers: number[];
  overallStatus: IngestionStatus;
  volumes: Array<{
    number: number;
    language: ContentLanguage;
    isFallback: boolean;
    chapters: string[];
    totalPagesEstimate: number;
  }>;
}
