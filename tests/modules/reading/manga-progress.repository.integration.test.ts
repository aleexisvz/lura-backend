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
            data: { email: "reader@test.dev", password: "hash" },
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

    it("findByUserAndManga() should return null when no progress exists", async () => {
        const result = await repo.findByUserAndManga(userId, mangaId);

        expect(result).toBeNull();
    });

    it("create() should persist progress and return it", async () => {
        const progress = await repo.create({
            userId,
            mangaId,
            volumeId: "volume-1",
            page: 5,
        });

        expect(progress).toMatchObject({
            userId,
            mangaId,
            volumeId: "volume-1",
            page: 5,
        });
        expect(progress.id).toEqual(expect.any(String));
    });

    it("findByUserAndManga() should return existing progress", async () => {
        await repo.create({
            userId,
            mangaId,
            volumeId: "volume-1",
            page: 10,
        });

        const found = await repo.findByUserAndManga(userId, mangaId);

        expect(found).toBeTruthy();
        expect(found?.page).toBe(10);
        expect(found?.volumeId).toBe("volume-1");
    });

    it("update() should update volumeId and page", async () => {
        const created = await repo.create({
            userId,
            mangaId,
            volumeId: "volume-1",
            page: 3,
        });

        const updated = await repo.update(created.id, {
            volumeId: "volume-2",
            page: 1,
        });

        expect(updated.volumeId).toBe("volume-2");
        expect(updated.page).toBe(1);
    });

    it("getContinueReading() should return progress ordered by updatedAt desc", async () => {
        const manga2 = await prisma.manga.create({
            data: { title: "Second Manga" },
        });

        await repo.create({
            userId,
            mangaId,
            volumeId: "v-1",
            page: 1,
        });

        await repo.create({
            userId,
            mangaId: manga2.id,
            volumeId: "v-2",
            page: 5,
        });

        const list = await repo.getContinueReading(userId);

        expect(list).toHaveLength(2);
        const [first, second] = list as [typeof list[0], typeof list[0]];
        expect(first.mangaId).toBe(manga2.id);
        expect(second.mangaId).toBe(mangaId);
    });
});
