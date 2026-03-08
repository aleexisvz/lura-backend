import { prisma } from "../../infrastructure/database/prisma.js"

export class MangaRepository {

  createManga(data: { userId: string; title: string; author?: string }) {
    return prisma.manga.create({
      data,
    })
  }

  findMangaById(id: string) {
    return prisma.manga.findUnique({
      where: { id },
    })
  }

  createVolume(data: {
    mangaId: string
    number: number
    title?: string
  }) {
    return prisma.volume.create({
      data: {
        ...data,
        status: "UPLOADING",
      },
    })
  }

  findVolumeById(id: string) {
    return prisma.volume.findUnique({
      where: { id },
    })
  }

  updateVolumeStatus(id: string, pagesCount: number) {
    return prisma.volume.update({
      where: { id },
      data: {
        status: "READY",
        pagesCount,
      },
    })
  }

  createPages(volumeId: string, pages: { index: number; filename: string }[]) {
    return prisma.page.createMany({
      data: pages.map((p) => ({
        volumeId,
        index: p.index,
        filename: p.filename,
      })),
    })
  }
  
  findMangaOwnedByUser(mangaId: string, userId: string) {
    return prisma.manga.findFirst({
      where: {
        id: mangaId,
        userId,
      },
    });
  }

  findVolumeOwnedByUser(volumeId: string, mangaId: string, userId: string) {
    return prisma.volume.findFirst({
      where: {
        id: volumeId,
        mangaId,
        Manga: {
          userId,
        },
      },
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