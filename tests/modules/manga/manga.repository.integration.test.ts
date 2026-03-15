import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { MangaRepository } from "../../../src/modules/manga/manga.repository.js";
import {
  disconnectTestDatabase,
  resetTestDatabase,
} from "../../helpers/db.js";

describe("MangaRepository (integration)", () => {
  const repo = new MangaRepository();

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("createManga() and findMangaById() should persist and read manga", async () => {
    const created = await repo.createManga({
      title: "One Piece",
      author: "Eiichiro Oda",
    });

    const found = await repo.findMangaById(created.id);

    expect(found).toBeTruthy();
    expect(found?.title).toBe("One Piece");
    expect(found?.author).toBe("Eiichiro Oda");
  });

  it("getAllMangas() should return records ordered by createdAt desc", async () => {
    await prisma.manga.create({
      data: {
        title: "Older manga",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await prisma.manga.create({
      data: {
        title: "Newer manga",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });

    const mangas = await repo.getAllMangas();

    expect(mangas.map((manga) => manga.title)).toEqual([
      "Newer manga",
      "Older manga",
    ]);
  });

  it("createVolume() and findVolumesByMangaId() should manage ordered volumes", async () => {
    const manga = await repo.createManga({ title: "Dandadan" });

    await repo.createVolume({ mangaId: manga.id, number: 2, title: "Volume 2" });
    await repo.createVolume({ mangaId: manga.id, number: 1, title: "Volume 1" });

    const volumes = await repo.findVolumesByMangaId(manga.id);

    expect(volumes.map((volume) => volume.number)).toEqual([1, 2]);
  });

  it("findVolumeByMangaAndNumber() should find an existing volume", async () => {
    const manga = await repo.createManga({ title: "Kaiju No. 8" });
    await repo.createVolume({ mangaId: manga.id, number: 3, title: "Volume 3" });

    const volume = await repo.findVolumeByMangaAndNumber(manga.id, 3);

    expect(volume).toBeTruthy();
    expect(volume?.number).toBe(3);
  });
});
