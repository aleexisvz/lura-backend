import { prisma } from "../../infrastructure/database/prisma.js"
import type { UpdateMangaDTO, UpdateVolumeDTO } from "./manga.types.js"

export class MangaRepository {

  findAllMangas(categories: string[] = []) {
    return prisma.manga.findMany({
      where: categories.length > 0 ? { categories: { hasSome: categories } } : undefined,
      orderBy: {
        createdAt: "desc",
      },
    })
  }

  createManga(data: { title: string; author?: string; categories?: string[] }) {
    return prisma.manga.create({
      data,
    })
  }

  updateManga(mangaId: string, data: UpdateMangaDTO) {
    return prisma.manga.update({
      where: { id: mangaId },
      data,
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
}
