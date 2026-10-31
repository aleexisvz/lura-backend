import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("Book progress routes (api)", () => {
  let app: FastifyInstance;
  let bookId: string;
  let otherUserHeader: { authorization: string };

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetTestDatabase();

    // buildAuthHeader(app, "USER") signs a token with sub "user-test-id"
    await prisma.user.create({
      data: { id: "user-test-id", email: "user@tests.local", username: "user_test", password: "hash" },
    });
    await prisma.user.create({
      data: { id: "user-other-id", email: "other@tests.local", username: "other_test", password: "hash" },
    });
    otherUserHeader = { authorization: `Bearer ${app.jwt.sign({ email: "other@tests.local", role: "USER" }, { sub: "user-other-id" })}` };

    bookId = (await prisma.book.create({ data: { title: "Dune" } })).id;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  const payload = {
    spineIndex: 2,
    sectionHref: "chapter-3.xhtml",
    locator: "epubcfi(/6/8)",
    progressPercent: 35,
    currentPage: 40,
    totalPages: 300,
    title: "Dune",
    chapterTitle: "Book I",
    completed: false,
  };

  it("GET /books/:bookId/progress returns null when nothing is saved", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/books/${bookId}/progress`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it("PUT then GET returns the saved progress with the public shape", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/books/${bookId}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload,
    });

    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(
      expect.objectContaining({
        userId: "user-test-id",
        bookId,
        spineIndex: 2,
        sectionHref: "chapter-3.xhtml",
        locator: "epubcfi(/6/8)",
        progressPercent: 35,
        currentPage: 40,
        totalPages: 300,
        title: "Dune",
        chapterTitle: "Book I",
        completed: false,
        completedAt: null,
        updatedAt: expect.any(String),
      })
    );

    const get = await app.inject({
      method: "GET",
      url: `/books/${bookId}/progress`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(get.json()).toEqual(put.json());
  });

  it("GET does not return progress saved by another user", async () => {
    await app.inject({
      method: "PUT",
      url: `/books/${bookId}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload,
    });

    const response = await app.inject({
      method: "GET",
      url: `/books/${bookId}/progress`,
      headers: otherUserHeader,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it("PUT does not downgrade totalPages with a transient chapter count", async () => {
    await app.inject({
      method: "PUT",
      url: `/books/${bookId}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload,
    });

    const response = await app.inject({
      method: "PUT",
      url: `/books/${bookId}/progress`,
      headers: buildAuthHeader(app, "USER"),
      payload: { ...payload, totalPages: 15, currentPage: 3 },
    });

    expect(response.json()).toEqual(expect.objectContaining({ totalPages: 300 }));
  });

  it("PUT returns 404 BOOK_NOT_FOUND for an unknown book", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/books/missing-book/progress",
      headers: buildAuthHeader(app, "USER"),
      payload,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "BOOK_NOT_FOUND",
      message: "Book not found",
      details: null,
    });
  });
});
