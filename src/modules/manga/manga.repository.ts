import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import { keysetAfter, type PageRequest } from "../../shared/http/pagination.js";
import type { UpdateMangaDTO, UpdateVolumeDTO } from "./manga.types.js";

const mangaWithTagsInclude = {
  mangaTags: {
    include: {
      Tag: true,
    },
  },
} as const;

export type MangaListFilter = { tagIds: string[]; search: string };

// Every condition is an AND term, so the tag, search and cursor filters never overwrite each other.
function mangaListWhere(filter: MangaListFilter, page: PageRequest): Prisma.MangaWhereInput {
  const conditions: Prisma.MangaWhereInput[] = [];
  if (filter.tagIds.length > 0) {
    conditions.push({ mangaTags: { some: { tagId: { in: filter.tagIds } } } });
  }
  if (filter.search) {
    conditions.push({
      OR: [
        { title: { contains: filter.search, mode: "insensitive" } },
        { titleKanji: { contains: filter.search, mode: "insensitive" } },
        { author: { contains: filter.search, mode: "insensitive" } },
      ],
    });
  }
  if (page?.cursor) {
    conditions.push(keysetAfter(page.cursor));
  }
  return { AND: conditions };
}

export class MangaRepository {
  findAllMangas(filter: MangaListFilter = { tagIds: [], search: "" }, page: PageRequest = null) {
    return prisma.manga.findMany({
      where: mangaListWhere(filter, page),
      include: mangaWithTagsInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // One extra row tells the service whether another page exists.
      ...(page ? { take: page.limit + 1 } : {}),
    });
  }

  countMangas(filter: MangaListFilter) {
    return prisma.manga.count({ where: mangaListWhere(filter, null) });
  }

  findFeaturedMangas(limit = 6) {
    return prisma.manga.findMany({
      include: {
        mangaTags: {
          include: {
            Tag: true,
          },
        },
        volumes: {
          where: { status: "READY" },
          orderBy: { number: "desc" },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });
  }

  findRecentUpdates(limit = 12) {
    return prisma.manga.findMany({
      include: {
        mangaTags: {
          include: {
            Tag: true,
          },
        },
        volumes: {
          where: { status: "READY" },
          orderBy: { number: "desc" },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });
  }

  async findTopRankings(limit = 10) {
    const sessions = await prisma.readingSession.groupBy({
      by: ["contentId"],
      where: { contentType: "MANGA" },
      _count: { id: true },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: limit,
    });

    const rankedIds = sessions.map((s) => s.contentId);
    const sessionCountMap = new Map(sessions.map((s) => [s.contentId, s._count.id]));

    const mangas = await prisma.manga.findMany({
      where: {
        id: { in: rankedIds },
      },
      include: {
        mangaTags: {
          include: {
            Tag: true,
          },
        },
        volumes: {
          where: { status: "READY" },
          orderBy: { number: "desc" },
          take: 1,
        },
      },
    });

    const rankedList = mangas
      .map((manga) => ({
        manga,
        readersCount: sessionCountMap.get(manga.id) ?? 0,
      }))
      .sort((a, b) => b.readersCount - a.readersCount);

    if (rankedList.length < limit) {
      const existingIds = new Set(rankedList.map((r) => r.manga.id));
      const fallbackMangas = await prisma.manga.findMany({
        where: {
          id: { notIn: Array.from(existingIds) },
        },
        include: {
          mangaTags: {
            include: {
              Tag: true,
            },
          },
          volumes: {
            where: { status: "READY" },
            orderBy: { number: "desc" },
            take: 1,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit - rankedList.length,
      });

      for (const manga of fallbackMangas) {
        rankedList.push({
          manga,
          readersCount: 0,
        });
      }
    }

    return rankedList;
  }

  createManga(data: {
    title: string;
    titleKanji?: string;
    author?: string;
    description?: string;
    tagIds?: string[];
    status?: "EN_EMISION" | "FINALIZADO";
  }) {
    return prisma.manga.create({
      data: {
        title: data.title,
        ...(data.titleKanji !== undefined ? { titleKanji: data.titleKanji } : {}),
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.tagIds !== undefined
          ? {
              mangaTags: {
                createMany: {
                  data: data.tagIds.map((tagId) => ({ tagId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: mangaWithTagsInclude,
    });
  }

  updateManga(mangaId: string, data: UpdateMangaDTO) {
    return prisma.manga.update({
      where: { id: mangaId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.titleKanji !== undefined ? { titleKanji: data.titleKanji } : {}),
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.tagIds !== undefined
          ? {
              mangaTags: {
                deleteMany: {},
                createMany: {
                  data: data.tagIds.map((tagId) => ({ tagId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: mangaWithTagsInclude,
    });
  }

  updateMangaCoverPath(mangaId: string, coverPath: string) {
    return prisma.manga.update({
      where: { id: mangaId },
      data: { coverPath },
    });
  }

  findMangaById(id: string) {
    return prisma.manga.findUnique({
      where: { id },
      include: mangaWithTagsInclude,
    });
  }

  createVolume(data: { mangaId: string; number: number; title?: string }) {
    return prisma.volume.create({
      data: {
        ...data,
        status: "UPLOADING",
      },
    });
  }

  findVolumeById(id: string) {
    return prisma.volume.findUnique({
      where: { id },
    });
  }

  updateVolume(volumeId: string, data: UpdateVolumeDTO) {
    return prisma.volume.update({
      where: { id: volumeId },
      data,
    });
  }

  updateVolumeCoverPath(volumeId: string, coverPath: string) {
    return prisma.volume.update({
      where: { id: volumeId },
      data: { coverPath },
    });
  }

  findVolumesByMangaId(mangaId: string) {
    return prisma.volume.findMany({
      where: { mangaId },
      orderBy: { number: "asc" },
    });
  }

  findVolumeByMangaAndNumber(mangaId: string, number: number) {
    return prisma.volume.findFirst({
      where: {
        mangaId,
        number,
      },
    });
  }

  /**
   * Marks a volume as ready after its pages were uploaded. `bumpVersion` is for a volume whose pages were
   * replaced: the version is part of the page URLs, so the new pages get new URLs.
   */
  updateVolumeStatus(id: string, pagesCount: number, options: { bumpVersion?: boolean } = {}) {
    return prisma.volume.update({
      where: { id },
      data: {
        status: "READY",
        pagesCount,
        ...(options.bumpVersion ? { version: { increment: 1 } } : {}),
      },
    });
  }

  deletePagesByVolumeId(volumeId: string) {
    return prisma.page.deleteMany({ where: { volumeId } });
  }

  createPages(volumeId: string, pages: { index: number; filename: string }[]) {
    return prisma.page.createMany({
      data: pages.map((p) => ({
        volumeId,
        index: p.index,
        filename: p.filename,
      })),
    });
  }

  findPagesByVolume(volumeId: string) {
    return prisma.page.findMany({
      where: { volumeId },
      orderBy: { index: "asc" },
      select: {
        index: true,
        filename: true,
      },
    });
  }

  findPageByVolumeAndIndex(volumeId: string, pageIndex: number) {
    return prisma.page.findFirst({
      where: {
        volumeId,
        index: pageIndex,
      },
      select: {
        index: true,
        filename: true,
      },
    });
  }
}
