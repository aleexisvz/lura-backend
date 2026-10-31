import type { BookProgress } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { BookProgressService, type SaveBookProgressInput } from "../../../src/modules/book/book-progress.service.js";
import type { BookProgressRepository } from "../../../src/modules/book/book-progress.repository.js";

type Row = BookProgress;

function createFakeRepo(bookExists = true) {
  const rows = new Map<string, Row>();
  const key = (userId: string, bookId: string) => `${userId}:${bookId}`;

  const repo = {
    bookExists: async () => (bookExists ? { id: "book-1" } : null),
    findByUserAndBook: async (userId: string, bookId: string) => rows.get(key(userId, bookId)) ?? null,
    upsert: async (userId: string, bookId: string, data: Omit<Row, "id" | "userId" | "bookId" | "createdAt">) => {
      const existing = rows.get(key(userId, bookId));
      const row: Row = {
        id: existing?.id ?? `row-${rows.size + 1}`,
        userId,
        bookId,
        createdAt: existing?.createdAt ?? new Date("2026-01-01T00:00:00Z"),
        ...data,
      };
      rows.set(key(userId, bookId), row);
      return row;
    },
  };

  return { repo: repo as unknown as BookProgressRepository, rows };
}

function input(overrides: Partial<SaveBookProgressInput> = {}): SaveBookProgressInput {
  return {
    spineIndex: 0,
    sectionHref: "chapter-1.xhtml",
    locator: "epubcfi(/6/2)",
    progressPercent: 10,
    completed: false,
    ...overrides,
  };
}

describe("BookProgressService (unit)", () => {
  it("getProgress() returns null when the user has no progress", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    expect(await service.getProgress("user-a", "book-1")).toBeNull();
  });

  it("saveProgress() throws BOOK_NOT_FOUND for an unknown book", async () => {
    const { repo } = createFakeRepo(false);
    const service = new BookProgressService(repo);

    await expect(service.saveProgress("user-a", "missing", input())).rejects.toMatchObject({
      code: "BOOK_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("does not downgrade a stored totalPages with a transient chapter count", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    await service.saveProgress("user-a", "book-1", input({ totalPages: 835, currentPage: 10 }));
    const saved = await service.saveProgress("user-a", "book-1", input({ totalPages: 15, currentPage: 11 }));

    expect(saved.totalPages).toBe(835);
  });

  it("accepts a larger totalPages value", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    await service.saveProgress("user-a", "book-1", input({ totalPages: 100 }));
    const saved = await service.saveProgress("user-a", "book-1", input({ totalPages: 120 }));

    expect(saved.totalPages).toBe(120);
  });

  it("ignores totalPages values of 1 or less", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const saved = await service.saveProgress("user-a", "book-1", input({ totalPages: 1 }));

    expect(saved.totalPages).toBeUndefined();
  });

  it("marks completed when explicitly flagged", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const saved = await service.saveProgress("user-a", "book-1", input({ completed: true }));

    expect(saved.completed).toBe(true);
    expect(saved.completedAt).not.toBeNull();
  });

  it("keeps a completed book completed when it is reopened at page 1", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    await service.saveProgress("user-a", "book-1", input({ progressPercent: 100 }));
    const reopened = await service.saveProgress(
      "user-a",
      "book-1",
      input({ progressPercent: 0, currentPage: 1, totalPages: 200 })
    );

    expect(reopened.completed).toBe(true);
    expect(reopened.completedAt).not.toBeNull();
  });

  it("marks completed at 100% progress", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const saved = await service.saveProgress("user-a", "book-1", input({ progressPercent: 100 }));

    expect(saved.completed).toBe(true);
  });

  it("marks completed on the last page only when progress is at least 95%", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const atLastPage = await service.saveProgress(
      "user-a",
      "book-1",
      input({ currentPage: 100, totalPages: 100, progressPercent: 96 })
    );
    expect(atLastPage.completed).toBe(true);

    const belowThreshold = await service.saveProgress(
      "user-b",
      "book-1",
      input({ currentPage: 100, totalPages: 100, progressPercent: 90 })
    );
    expect(belowThreshold.completed).toBe(false);
  });

  it("keeps completedAt across saves while the book stays completed", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const first = await service.saveProgress("user-a", "book-1", input({ completed: true }));
    const second = await service.saveProgress("user-a", "book-1", input({ completed: true, progressPercent: 100 }));

    expect(second.completedAt).toBe(first.completedAt);
  });

  it("leaves completedAt null for a book that was never completed", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const saved = await service.saveProgress("user-a", "book-1", input({ progressPercent: 20 }));

    expect(saved.completed).toBe(false);
    expect(saved.completedAt).toBeNull();
  });

  it("keeps title, chapterTitle and coverUrl when a later save omits them", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    await service.saveProgress(
      "user-a",
      "book-1",
      input({ title: "Dune", chapterTitle: "Book I", coverUrl: "https://cdn.test/cover.webp" })
    );
    const saved = await service.saveProgress("user-a", "book-1", input({ progressPercent: 40 }));

    expect(saved.title).toBe("Dune");
    expect(saved.chapterTitle).toBe("Book I");
    expect(saved.coverUrl).toBe("https://cdn.test/cover.webp");
  });

  it("clears coverUrl when an empty value is sent", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    await service.saveProgress("user-a", "book-1", input({ coverUrl: "https://cdn.test/cover.webp" }));
    const saved = await service.saveProgress("user-a", "book-1", input({ coverUrl: null }));

    expect(saved.coverUrl).toBeUndefined();
  });

  it("clamps progressPercent to 0..100", async () => {
    const { repo } = createFakeRepo();
    const service = new BookProgressService(repo);

    const high = await service.saveProgress("user-a", "book-1", input({ progressPercent: 250 }));
    const low = await service.saveProgress("user-b", "book-1", input({ progressPercent: -5 }));

    expect(high.progressPercent).toBe(100);
    expect(low.progressPercent).toBe(0);
  });
});
