import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import path from "node:path";
import { BookService } from "../../../src/modules/book/book.service.js";

describe("BookService (unit)", () => {
  const repo = {
    findAllBooks: vi.fn(),
    findBookById: vi.fn(),
    createBook: vi.fn(),
    updateBook: vi.fn(),
    updateBookEpubPath: vi.fn(),
    updateBookCoverPath: vi.fn(),
  };

  const storage = {
    resolveBookEpubPath: vi.fn(),
    ensureDir: vi.fn(),
    saveStream: vi.fn(),
  };

  const tagsRepo = {
    findByIds: vi.fn(),
  };

  let service: BookService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BookService(repo as any, storage as any, tagsRepo as any);
  });

  it("getAllBooks() should return repository list", async () => {
    repo.findAllBooks.mockResolvedValue([
      {
        id: "b-1",
        title: "Dune",
        author: "Frank Herbert",
        description: null,
        coverPath: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        epubPath: null,
        bookTags: [],
      },
    ]);

    const result = await service.getAllBooks();

    expect(repo.findAllBooks).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        id: "b-1",
        title: "Dune",
        hasEpub: false,
        categories: [],
      }),
    ]);
  });

  it("getBookById() should return existing book", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
      author: null,
      description: null,
      coverPath: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      epubPath: "books/b-1/book.epub",
      bookTags: [],
    });

    const result = await service.getBookById("b-1");

    expect(repo.findBookById).toHaveBeenCalledWith("b-1");
    expect(result).toEqual(
      expect.objectContaining({
        id: "b-1",
        title: "Dune",
        hasEpub: true,
      })
    );
  });

  it("createBook() should delegate to repository", async () => {
    tagsRepo.findByIds.mockResolvedValue([
      { id: "t-1", scope: "BOOK", name: "Sci-Fi", slug: "sci-fi" },
    ]);
    repo.createBook.mockResolvedValue({
      id: "b-1",
      title: "Dune",
      author: "Frank Herbert",
      description: "Sci-fi classic",
      coverPath: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      epubPath: null,
      bookTags: [
        {
          Tag: { id: "t-1", name: "Sci-Fi", slug: "sci-fi" },
        },
      ],
    });

    const result = await service.createBook({
      title: "Dune",
      author: "Frank Herbert",
      description: "Sci-fi classic",
      tagIds: ["t-1", "t-1"],
    });

    expect(repo.createBook).toHaveBeenCalledWith({
      title: "Dune",
      author: "Frank Herbert",
      description: "Sci-fi classic",
      tagIds: ["t-1"],
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "b-1",
        title: "Dune",
        hasEpub: false,
        categories: ["Sci-Fi"],
      })
    );
  });

  it("createBook() should reject manga tags", async () => {
    tagsRepo.findByIds.mockResolvedValue([
      { id: "t-2", scope: "MANGA", name: "Action", slug: "action" },
    ]);

    await expect(
      service.createBook({
        title: "Dune",
        tagIds: ["t-2"],
      })
    ).rejects.toMatchObject({
      code: "TAG_SCOPE_MISMATCH",
      statusCode: 400,
    });
  });

  it("uploadEpub() should save epub and persist relative path", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
      bookTags: [],
    });
    const absolutePath = path.join("C:", "repo", "storage", "books", "b-1", "book.epub");
    const expectedDir = path.dirname(absolutePath);
    storage.resolveBookEpubPath.mockReturnValue(absolutePath);

    const fileStream = Readable.from(["epub-bytes"]);
    const req = {
      file: vi.fn().mockResolvedValue({
        filename: "dune.epub",
        mimetype: "application/epub+zip",
        file: fileStream,
      }),
    };

    const result = await service.uploadEpub(req as any, "b-1");

    expect(storage.ensureDir).toHaveBeenCalledWith(expectedDir);
    expect(storage.saveStream).toHaveBeenCalledWith(fileStream, absolutePath);
    expect(repo.updateBookEpubPath).toHaveBeenCalledWith("b-1", "books/b-1/book.epub");
    expect(result).toEqual({ uploaded: true });
  });
});
