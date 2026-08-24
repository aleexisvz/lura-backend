import { prisma } from "../../infrastructure/database/prisma.js";
import type { ContentLanguage, IngestionStatus, MangaStatus, VolumeStatus } from "@prisma/client";

export class IngestionRepository {
  async findMangaByExternalId(externalId: string) {
    const tracker = await prisma.mangaIngestionTracker.findFirst({
      where: { externalMangaId: externalId },
      include: { Manga: true },
    });
    return tracker?.Manga || null;
  }

  async findMangaByTitle(title: string) {
    return prisma.manga.findFirst({
      where: {
        title: {
          equals: title,
          mode: "insensitive",
        },
      },
    });
  }

  async createManga(data: {
    title: string;
    titleKanji?: string | null;
    author?: string | null;
    description?: string | null;
    status: MangaStatus;
  }) {
    return prisma.manga.create({
      data: {
        title: data.title,
        titleKanji: data.titleKanji ?? null,
        author: data.author ?? null,
        description: data.description ?? null,
        status: data.status,
      },
    });
  }

  async updateMangaCover(mangaId: string, coverPath: string) {
    return prisma.manga.update({
      where: { id: mangaId },
      data: { coverPath },
    });
  }

  async updateMangaMetadata(
    mangaId: string,
    data: {
      titleKanji?: string | null;
      author?: string | null;
      description?: string | null;
      status?: MangaStatus;
    }
  ) {
    return prisma.manga.update({
      where: { id: mangaId },
      data: {
        ...(data.titleKanji !== undefined ? { titleKanji: data.titleKanji } : {}),
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
  }

  async findVolumeByMangaAndNumber(mangaId: string, number: number) {
    return prisma.volume.findUnique({
      where: {
        mangaId_number: {
          mangaId,
          number,
        },
      },
    });
  }

  async createVolume(data: {
    mangaId: string;
    number: number;
    title?: string | null;
    status: VolumeStatus;
    pagesCount: number;
    language: ContentLanguage;
    isFallback: boolean;
  }) {
    return prisma.volume.create({
      data: {
        mangaId: data.mangaId,
        number: data.number,
        title: data.title ?? null,
        status: data.status,
        pagesCount: data.pagesCount,
        language: data.language,
        isFallback: data.isFallback,
        version: 1,
      },
    });
  }

  async updateVolume(
    volumeId: string,
    data: {
      status?: VolumeStatus;
      pagesCount?: number;
      language?: ContentLanguage;
      isFallback?: boolean;
      version?: number;
      coverPath?: string;
    }
  ) {
    return prisma.volume.update({
      where: { id: volumeId },
      data,
    });
  }

  async deletePagesByVolumeId(volumeId: string) {
    return prisma.page.deleteMany({
      where: { volumeId },
    });
  }

  async createPages(volumeId: string, pages: Array<{ index: number; filename: string }>) {
    return prisma.page.createMany({
      data: pages.map((p) => ({
        volumeId,
        index: p.index,
        filename: p.filename,
      })),
    });
  }

  async upsertTracker(data: {
    mangaId: string;
    externalMangaId: string;
    status: IngestionStatus;
    pendingSpanishVols: number[];
  }) {
    return prisma.mangaIngestionTracker.upsert({
      where: { mangaId: data.mangaId },
      create: {
        mangaId: data.mangaId,
        externalMangaId: data.externalMangaId,
        status: data.status,
        pendingSpanishVols: data.pendingSpanishVols,
      },
      update: {
        status: data.status,
        pendingSpanishVols: data.pendingSpanishVols,
        lastCheckedAt: new Date(),
      },
    });
  }

  async findHybridTrackers() {
    return prisma.mangaIngestionTracker.findMany({
      where: {
        status: "HYBRID",
      },
      include: {
        Manga: {
          include: {
            volumes: true,
          },
        },
      },
    });
  }

  async deleteVolume(volumeId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.mangaProgress.deleteMany({ where: { volumeId } });
      await tx.volumeCompletion.deleteMany({ where: { volumeId } });
      await tx.page.deleteMany({ where: { volumeId } });
      return tx.volume.delete({ where: { id: volumeId } });
    });
  }

  async deleteManga(mangaId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.mangaProgress.deleteMany({ where: { mangaId } });
      await tx.volumeCompletion.deleteMany({ where: { mangaId } });
      await tx.mangaTag.deleteMany({ where: { mangaId } });
      await tx.mangaIngestionTracker.deleteMany({ where: { mangaId } });

      const volumes = await tx.volume.findMany({ where: { mangaId }, select: { id: true } });
      const volIds = volumes.map((v) => v.id);
      if (volIds.length > 0) {
        await tx.page.deleteMany({ where: { volumeId: { in: volIds } } });
        await tx.volume.deleteMany({ where: { mangaId } });
      }

      return tx.manga.delete({ where: { id: mangaId } });
    });
  }

  async findAllTrackers() {
    return prisma.mangaIngestionTracker.findMany({
      include: {
        Manga: {
          include: {
            volumes: {
              orderBy: {
                number: "asc",
              },
            },
          },
        },
      },
    });
  }

  async findActiveTrackers() {
    return prisma.mangaIngestionTracker.findMany({
      where: {
        OR: [
          { status: "HYBRID" },
          { Manga: { status: "EN_EMISION" } },
        ],
      },
      include: {
        Manga: {
          include: {
            volumes: {
              orderBy: {
                number: "asc",
              },
            },
          },
        },
      },
    });
  }

  async updateTrackerStatus(
    trackerId: string,
    data: {
      status: IngestionStatus;
      pendingSpanishVols: number[];
    }
  ) {
    return prisma.mangaIngestionTracker.update({
      where: { id: trackerId },
      data: {
        status: data.status,
        pendingSpanishVols: data.pendingSpanishVols,
        lastCheckedAt: new Date(),
      },
    });
  }

  /**
   * Clamps reading progress if new volume page count is smaller
   */
  async clampReadingProgress(volumeId: string, maxPages: number) {
    return prisma.mangaProgress.updateMany({
      where: {
        volumeId,
        page: {
          gt: maxPages,
        },
      },
      data: {
        page: maxPages,
      },
    });
  }

  /**
   * Returns a set of externalMangaIds already tracked in the database
   */
  async findExistingExternalIds(externalIds: string[]) {
    const existing = await prisma.mangaIngestionTracker.findMany({
      where: {
        externalMangaId: { in: externalIds },
      },
      select: {
        externalMangaId: true,
      },
    });
    return new Set(existing.map((e) => e.externalMangaId));
  }

  /**
   * Returns existing mangas by matching titles
   */
  async findExistingTitles(titles: string[]) {
    const existing = await prisma.manga.findMany({
      where: {
        title: { in: titles, mode: "insensitive" },
      },
      select: {
        title: true,
      },
    });
    return new Set(existing.map((e) => e.title.toLowerCase()));
  }

  /**
   * Upserts tags for MANGA scope and links them to the manga in MangaTag table
   */
  async syncMangaTags(mangaId: string, tagNames: string[]) {
    if (tagNames.length === 0) return [];

    const tagIds: string[] = [];

    for (const rawName of tagNames) {
      const name = rawName.trim();
      if (!name) continue;
      const slug = name.toLowerCase().replace(/\s+/g, "-");

      const tag = await prisma.tag.upsert({
        where: {
          scope_slug: {
            scope: "MANGA",
            slug,
          },
        },
        create: {
          scope: "MANGA",
          name,
          slug,
        },
        update: {},
      });

      tagIds.push(tag.id);
    }

    if (tagIds.length > 0) {
      await prisma.mangaTag.createMany({
        data: tagIds.map((tagId) => ({
          mangaId,
          tagId,
        })),
        skipDuplicates: true,
      });
    }

    return tagIds;
  }
}
