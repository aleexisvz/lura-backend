import { prisma } from "../../infrastructure/database/prisma.js"

export class MangaRepository {

  getAllMangas() {
    return prisma.manga.findMany({
      orderBy: {
        createdAt: "desc",
      },
    })
  }

  createManga(data: { title: string; author?: string }) {
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

  findVolumesByMangaId(mangaId: string) {
    return prisma.volume.findMany({
      where: { mangaId },
      orderBy: { number: "asc" },
    })
  }

  findVolumeByMangaAndNumber(mangaId: string, number: number) {
    return prisma.volume.findFirst({
      where: {
        mangaId,
        number,
      },
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

  findProgress(userId: string, mangaId: string) {
    return prisma.mangaProgress.findUnique({
      where: {
        userId_mangaId: {
          userId,
          mangaId,
        },
      },
    })
  }

  createProgress(data: { userId: string; mangaId: string; volumeId: string; page: number }) {
    return prisma.mangaProgress.create({
      data,
    })
  }

  updateProgress(userId: string, mangaId: string, data: { volumeId: string; page: number }) {
    return prisma.mangaProgress.update({
      where: {
        userId_mangaId: {
          userId,
          mangaId,
        },
      },
      data,
    })
  }
}