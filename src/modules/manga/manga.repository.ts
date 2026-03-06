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
}