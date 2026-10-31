import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { BookProgressRepository } from "../../../src/modules/book/book-progress.repository.js";
import { BookProgressService } from "../../../src/modules/book/book-progress.service.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("BookProgress (integration)", () => {
  const repo = new BookProgressRepository();
  const service = new BookProgressService(repo);
  let userA: string;
  let userB: string;
  let bookId: string;
  let otherBookId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    userA = (
      await prisma.user.create({
        data: { email: "a@test.dev", username: "reader_a", password: "hash" },
      })
    ).id;
    userB = (
      await prisma.user.create({
        data: { email: "b@test.dev", username: "reader_b", password: "hash" },
      })
    ).id;
    bookId = (await prisma.book.create({ data: { title: "Dune" } })).id;
    otherBookId = (await prisma.book.create({ data: { title: "Foundation" } })).id;
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  const save = (userId: string, book: string, overrides: Record<string, unknown> = {}) =>
    service.saveProgress(userId, book, {
      spineIndex: 0,
      sectionHref: "c1.xhtml",
      locator: "epubcfi(/6/2)",
      progressPercent: 10,
      completed: false,
      ...overrides,
    });

  describe("isolation between users", () => {
    it("does not return another user's progress for the same book", async () => {
      await save(userA, bookId, { progressPercent: 42 });

      expect(await service.getProgress(userA, bookId)).toMatchObject({ progressPercent: 42 });
      expect(await service.getProgress(userB, bookId)).toBeNull();
    });

    it("keeps one row per user and book", async () => {
      await save(userA, bookId, { progressPercent: 10 });
      await save(userA, bookId, { progressPercent: 20 });

      const rows = await prisma.bookProgress.findMany({ where: { userId: userA, bookId } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.progressPercent).toBe(20);
    });
  });

  describe("statistics", () => {
    it("sums pages per user, counting a missing currentPage as 1", async () => {
      await save(userA, bookId, { currentPage: 50, totalPages: 300 });
      await save(userA, otherBookId, { currentPage: null as unknown as number });
      await save(userB, bookId, { currentPage: 999, totalPages: 1000 });

      expect(await service.sumPagesForUser(userA)).toBe(51);
      expect(await service.sumPagesForUser(userB)).toBe(999);
      expect(await service.sumPagesForUser("no-such-user")).toBe(0);
    });

    it("counts completed books with the same rule as the save path", async () => {
      // completed flag
      await save(userA, bookId, { completed: true });
      // 100% progress
      await save(userA, otherBookId, { progressPercent: 100 });
      // last page reached but below 95% progress: not completed
      const third = await prisma.book.create({ data: { title: "Third" } });
      await prisma.bookProgress.create({
        data: {
          userId: userA,
          bookId: third.id,
          progressPercent: 80,
          currentPage: 100,
          totalPages: 100,
        },
      });
      // totalPages of 1 never counts as a page-based completion
      const fourth = await prisma.book.create({ data: { title: "Fourth" } });
      await prisma.bookProgress.create({
        data: {
          userId: userA,
          bookId: fourth.id,
          progressPercent: 10,
          currentPage: 1,
          totalPages: 1,
        },
      });
      // another user's completed book must not count
      await save(userB, bookId, { completed: true });

      expect(await repo.countCompletedByUser(userA)).toBe(2);
      expect(await repo.countCompletedByUser(userB)).toBe(1);
    });

    it("a book opened once is not counted, and a finished book stays completed when reopened", async () => {
      await save(userA, bookId, { currentPage: 10, totalPages: 200, progressPercent: 5 });
      expect(await repo.countCompletedByUser(userA)).toBe(0);

      await save(userA, bookId, { currentPage: 200, totalPages: 200, progressPercent: 100 });
      expect(await repo.countCompletedByUser(userA)).toBe(1);

      const reopened = await save(userA, bookId, { currentPage: 1, totalPages: 200, progressPercent: 0 });
      expect(reopened.completed).toBe(true);
      expect(await repo.countCompletedByUser(userA)).toBe(1);
    });

    it("findReadersForBook() returns users with progress on the book only", async () => {
      await save(userA, bookId, { progressPercent: 10 });
      await save(userB, bookId, { progressPercent: 20 });
      await save(userB, otherBookId, { progressPercent: 30 });

      const readers = await repo.findReadersForBook(bookId, 40);

      expect(readers.map((r) => r.userId).sort()).toEqual([userA, userB].sort());
    });

    it("findInProgressForUser() excludes completed books and sorts by most recent", async () => {
      await save(userA, bookId, { progressPercent: 30 });
      await save(userA, otherBookId, { completed: true });
      const third = await prisma.book.create({ data: { title: "Third" } });
      await save(userA, third.id, { progressPercent: 50 });

      const inProgress = await service.findInProgressForUser(userA, 20);

      expect(inProgress.map((item) => item.bookId)).toEqual([third.id, bookId]);
    });
  });
});
