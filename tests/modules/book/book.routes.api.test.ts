import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("Book routes (api)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it("POST /books should create book for admin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/books",
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        title: "Dune",
        author: "Frank Herbert",
        description: "Sci-fi classic",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: "Dune",
        author: "Frank Herbert",
        description: "Sci-fi classic",
      })
    );
  });

  it("PATCH /books/:bookId should update metadata", async () => {
    const oldTag = await prisma.tag.create({
      data: {
        scope: "BOOK",
        name: "old",
        slug: "old",
      },
    });
    const sciFiTag = await prisma.tag.create({
      data: {
        scope: "BOOK",
        name: "Sci-Fi",
        slug: "sci-fi",
      },
    });
    const classicTag = await prisma.tag.create({
      data: {
        scope: "BOOK",
        name: "classic",
        slug: "classic",
      },
    });

    const book = await prisma.book.create({
      data: {
        title: "Old title",
        bookTags: {
          create: [{ tagId: oldTag.id }],
        },
      },
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/books/${book.id}`,
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        title: "New title",
        tagIds: [sciFiTag.id, sciFiTag.id, classicTag.id],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        title: "New title",
        categories: ["Sci-Fi", "classic"],
      })
    );
  });

  it("POST /books should reject non-admin users", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/books",
      headers: buildAuthHeader(app, "USER"),
      payload: {
        title: "Dune",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "ADMIN_ONLY",
        message: "Admin only",
      })
    );
  });

  it("POST /books should validate invalid params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/books",
      headers: buildAuthHeader(app, "ADMIN"),
      payload: {
        title: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "INVALID_PARAMS",
        message: "Invalid params",
      })
    );
  });

  it("POST /books/:bookId/upload-epub should require auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/books/some-book/upload-epub",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("POST /books/:bookId/upload-epub should reject non-admin users", async () => {
    const book = await prisma.book.create({
      data: { title: "Dune" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/books/${book.id}/upload-epub`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "ADMIN_ONLY",
      })
    );
  });

  it("POST /books/:bookId/upload-epub should return 404 for unknown book", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/books/missing-book-id/upload-epub",
      headers: buildAuthHeader(app, "ADMIN"),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "BOOK_NOT_FOUND",
        message: "Book not found",
      })
    );
  });

  it("POST /books/:bookId/upload-epub should return 400 when file is missing", async () => {
    const book = await prisma.book.create({
      data: { title: "Dune" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/books/${book.id}/upload-epub`,
      headers: buildAuthHeader(app, "ADMIN"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "NO_FILES_UPLOADED",
      })
    );
  });

  it("GET /books should return all books ordered by createdAt desc", async () => {
    await prisma.book.create({
      data: {
        title: "Older",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await prisma.book.create({
      data: {
        title: "Newer",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/books",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((book: { title: string }) => book.title)).toEqual([
      "Newer",
      "Older",
    ]);
  });

  it("GET /books?tagIds should filter by OR logic", async () => {
    const fantasyTag = await prisma.tag.create({
      data: {
        scope: "BOOK",
        name: "fantasy",
        slug: "fantasy",
      },
    });
    const historyTag = await prisma.tag.create({
      data: {
        scope: "BOOK",
        name: "history",
        slug: "history",
      },
    });
    const scienceTag = await prisma.tag.create({
      data: {
        scope: "BOOK",
        name: "science",
        slug: "science",
      },
    });

    await prisma.book.create({
      data: {
        title: "Fantasy book",
        bookTags: {
          create: [{ tagId: fantasyTag.id }],
        },
      },
    });

    await prisma.book.create({
      data: {
        title: "History book",
        bookTags: {
          create: [{ tagId: historyTag.id }],
        },
      },
    });

    await prisma.book.create({
      data: {
        title: "No match",
        bookTags: {
          create: [{ tagId: scienceTag.id }],
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/books?tagIds=${fantasyTag.id},${historyTag.id}`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().map((book: { title: string }) => book.title).sort()).toEqual([
      "Fantasy book",
      "History book",
    ]);
  });

  it("GET /books/:bookId should return book by id", async () => {
    const book = await prisma.book.create({
      data: {
        title: "Foundation",
        author: "Isaac Asimov",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/books/${book.id}`,
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: book.id,
        title: "Foundation",
        author: "Isaac Asimov",
      })
    );
  });

  it("GET /books/:bookId should return 404 when missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/books/missing-book-id",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "BOOK_NOT_FOUND",
        message: "Book not found",
      })
    );
  });

  it("GET /books should require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/books",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
      message: expect.any(String),
      details: null,
    });
  });

  it("GET /books/rankings should require auth and return ranked books", async () => {
    const unauthResponse = await app.inject({
      method: "GET",
      url: "/books/rankings",
    });
    expect(unauthResponse.statusCode).toBe(401);

    const b1 = await prisma.book.create({
      data: {
        title: "Top Book 1",
        author: "Author One",
      },
    });
    const b2 = await prisma.book.create({
      data: {
        title: "Top Book 2",
        author: "Author Two",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/books/rankings?limit=5",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    const rankings = response.json();
    expect(rankings).toBeInstanceOf(Array);
    expect(rankings.length).toBeGreaterThanOrEqual(2);
    expect(rankings[0]).toMatchObject({
      rank: 1,
      readersCount: expect.any(Number),
      book: expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
      }),
    });
  });
});
