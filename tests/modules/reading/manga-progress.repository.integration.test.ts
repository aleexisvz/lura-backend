import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { MangaProgressRepository } from "../../../src/modules/reading/manga-progress.repository.js";
import {
    disconnectTestDatabase,
    resetTestDatabase,
} from "../../helpers/db.js";

describe("MangaProgressRepository (integration)", () => {
    const repo = new MangaProgressRepository();
    let userId: string;
    let mangaId: string;

    beforeEach(async () => {
        await resetTestDatabase();

        const user = await prisma.user.create({
            data: { email: "reader@test.dev", username: "reader_test", password: "hash" },
        });
        userId = user.id;

        const manga = await prisma.manga.create({
            data: { title: "Test Manga" },
        });
        mangaId = manga.id;
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    it("findLatestByUserAndManga() should return null when no progress exists", async () => {
        const result = await repo.findLatestByUserAndManga(userId, mangaId);

        expect(result).toBeNull();
    });

    it("create() should persist progress and return it", async () => {
        const volume = await prisma.volume.create({
            data: { mangaId, number: 1, status: "READY", pagesCount: 30 },
        });

        const progress = await repo.create({
            userId,
            mangaId,
            volumeId: volume.id,
            page: 5,
        });

        expect(progress).toMatchObject({
            userId,
            mangaId,
            volumeId: volume.id,
            page: 5,
        });
        expect(progress.id).toEqual(expect.any(String));
    });

    it("findByUserAndMangaAndVolume() should return existing progress", async () => {
        const volume = await prisma.volume.create({
            data: { mangaId, number: 1, status: "READY", pagesCount: 30 },
        });

        await repo.create({
            userId,
            mangaId,
            volumeId: volume.id,
            page: 10,
        });

        const found = await repo.findByUserAndMangaAndVolume(userId, mangaId, volume.id);

        expect(found).toBeTruthy();
        expect(found?.page).toBe(10);
        expect(found?.volumeId).toBe(volume.id);
    });

    it("update() should update page", async () => {
        const volume = await prisma.volume.create({
            data: { mangaId, number: 1, status: "READY", pagesCount: 30 },
        });

        const created = await repo.create({
            userId,
            mangaId,
            volumeId: volume.id,
            page: 3,
        });

        const updated = await repo.update(created.id, {
            page: 7,
        });

        expect(updated.volumeId).toBe(volume.id);
        expect(updated.page).toBe(7);
    });

    it("findLatestByUserAndManga() should return most recently updated progress", async () => {
        const volume1 = await prisma.volume.create({
            data: { mangaId, number: 1, status: "READY", pagesCount: 30 },
        });
        const volume2 = await prisma.volume.create({
            data: { mangaId, number: 2, status: "READY", pagesCount: 30 },
        });

        await repo.create({
            userId,
            mangaId,
            volumeId: volume1.id,
            page: 4,
        });

        await repo.create({
            userId,
            mangaId,
            volumeId: volume2.id,
            page: 9,
        });

        const latest = await repo.findLatestByUserAndManga(userId, mangaId);
        expect(latest?.volumeId).toBe(volume2.id);
    });

    it("getContinueReading() should return progress ordered by updatedAt desc", async () => {
        const manga2 = await prisma.manga.create({
            data: { title: "Second Manga" },
        });
        const volume1 = await prisma.volume.create({
            data: { mangaId, number: 1, status: "READY", pagesCount: 30 },
        });
        const volume2 = await prisma.volume.create({
            data: { mangaId: manga2.id, number: 1, status: "READY", pagesCount: 30 },
        });

        await repo.create({
            userId,
            mangaId,
            volumeId: volume1.id,
            page: 1,
        });

        await repo.create({
            userId,
            mangaId: manga2.id,
            volumeId: volume2.id,
            page: 5,
        });

        const list = await repo.getContinueReading(userId);

        expect(list).toHaveLength(2);
        const [first, second] = list as [typeof list[0], typeof list[0]];
        expect(first.mangaId).toBe(manga2.id);
        expect(second.mangaId).toBe(mangaId);
    });

    it("findMangaById() should return the manga when it exists", async () => {
        const found = await repo.findMangaById(mangaId);

        expect(found).toBeTruthy();
        expect(found?.id).toBe(mangaId);
    });

    it("findMangaById() should return null for an unknown id", async () => {
        const found = await repo.findMangaById("non-existent-id");

        expect(found).toBeNull();
    });

    it("findVolumeById() should return the volume when it exists", async () => {
        const volume = await prisma.volume.create({
            data: { mangaId, number: 1, status: "READY", pagesCount: 30 },
        });

        const found = await repo.findVolumeById(volume.id);

        expect(found).toBeTruthy();
        expect(found?.id).toBe(volume.id);
        expect(found?.mangaId).toBe(mangaId);
        expect(found?.pagesCount).toBe(30);
    });

    it("findVolumeById() should return null for an unknown id", async () => {
        const found = await repo.findVolumeById("non-existent-id");

        expect(found).toBeNull();
    });
});
