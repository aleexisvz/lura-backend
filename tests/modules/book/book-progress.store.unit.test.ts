import { beforeEach, describe, expect, it } from "vitest";
import { bookProgressStore } from "../../../src/modules/book/book-progress.store.js";

describe("BookProgressStore (unit)", () => {
  const userId = "test-user-" + Date.now();
  const book1 = "book-1";
  const book2 = "book-2";

  it("should not count a book as completed when opening it initially", () => {
    bookProgressStore.save(userId, book1, {
      spineIndex: 0,
      sectionHref: "text/chapter1.xhtml",
      locator: "epubcfi(/6/2)",
      progressPercent: 5,
      currentPage: 10,
      totalPages: 200,
      title: "Sample Book 1",
    });

    const record = bookProgressStore.get(userId, book1);
    expect(record?.completed).toBe(false);
    expect(bookProgressStore.countCompletedBooksForUser(userId)).toBe(0);
  });

  it("should mark a book as completed when progress reaches 100% or end of pages", () => {
    bookProgressStore.save(userId, book1, {
      spineIndex: 20,
      sectionHref: "text/conclusion.xhtml",
      locator: "epubcfi(/6/40)",
      progressPercent: 100,
      currentPage: 200,
      totalPages: 200,
      title: "Sample Book 1",
    });

    const record = bookProgressStore.get(userId, book1);
    expect(record?.completed).toBe(true);
    expect(bookProgressStore.countCompletedBooksForUser(userId)).toBe(1);
  });

  it("should preserve completed status if a completed book is reopened at page 1", () => {
    bookProgressStore.save(userId, book1, {
      spineIndex: 0,
      sectionHref: "text/chapter1.xhtml",
      locator: "epubcfi(/6/2)",
      progressPercent: 0,
      currentPage: 1,
      totalPages: 200,
      title: "Sample Book 1",
    });

    const record = bookProgressStore.get(userId, book1);
    expect(record?.completed).toBe(true);
    expect(bookProgressStore.countCompletedBooksForUser(userId)).toBe(1);
  });

  it("should not increment completed count when opening a second book without finishing it", () => {
    bookProgressStore.save(userId, book2, {
      spineIndex: 0,
      sectionHref: "text/intro.xhtml",
      locator: "epubcfi(/6/2)",
      progressPercent: 2,
      currentPage: 3,
      totalPages: 150,
      title: "Sample Book 2",
    });

    const record2 = bookProgressStore.get(userId, book2);
    expect(record2?.completed).toBe(false);
    expect(bookProgressStore.countCompletedBooksForUser(userId)).toBe(1);
  });

  it("should increment completed count when second book is finished", () => {
    bookProgressStore.save(userId, book2, {
      spineIndex: 15,
      sectionHref: "text/epilogue.xhtml",
      locator: "epubcfi(/6/30)",
      progressPercent: 98,
      currentPage: 150,
      title: "Sample Book 2",
      completed: true,
    });

    const record2 = bookProgressStore.get(userId, book2);
    expect(record2?.completed).toBe(true);
    expect(bookProgressStore.countCompletedBooksForUser(userId)).toBe(2);
  });
});
