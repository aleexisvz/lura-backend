import { prisma } from "../../infrastructure/database/prisma.js";
import type { UpdateMangaDTO, UpdateVolumeDTO } from "./manga.types.js";

const mangaWithTagsInclude = {
  mangaTags: {
    include: {
      Tag: true,
    },
  },
} as const;

export class MangaRepository {
  findAllMangas(tagIds: string[] = []) {
    return prisma.manga.findMany({
      ...(tagIds.length > 0
        ? {
            where: {
              mangaTags: {
                some: {
                  tagId: { in: tagIds },
                },
              },
            },
          }
        : {}),
      include: mangaWithTagsInclude,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  createManga(data: {
    title: string;
    titleKanji?: string;
    author?: string;
    description?: string;
    tagIds?: string[];
  }) {
    return prisma.manga.create({
      data: {
        title: data.title,
        ...(data.titleKanji !== undefined ? { titleKanji: data.titleKanji } : {}),
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
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

  updateVolumeStatus(id: string, pagesCount: number) {
    return prisma.volume.update({
      where: { id },
      data: {
        status: "READY",
        pagesCount,
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
