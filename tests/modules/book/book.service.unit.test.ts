import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import path from "node:path";
import { BookService } from "../../../src/modules/book/book.service.js";

describe("BookService (unit)", () => {
  const repo = {
    findAllBooks: vi.fn(),
    findBookById: vi.fn(),
    createBook: vi.fn(),
    updateBookEpubPath: vi.fn(),
  };

  const storage = {
    resolveBookEpubPath: vi.fn(),
    ensureDir: vi.fn(),
    saveStream: vi.fn(),
  };

  let service: BookService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BookService(repo as any, storage as any);
  });

  it("getAllBooks() should return repository list", async () => {
    repo.findAllBooks.mockResolvedValue([
      {
        id: "b-1",
        title: "Dune",
        author: "Frank Herbert",
        description: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        epubPath: null,
      },
    ]);

    const result = await service.getAllBooks();

    expect(repo.findAllBooks).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        id: "b-1",
        title: "Dune",
        hasEpub: false,
      }),
    ]);
  });

  it("getBookById() should return existing book", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
      author: null,
      description: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      epubPath: "books/b-1/book.epub",
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

  it("getBookById() should throw BOOK_NOT_FOUND when book does not exist", async () => {
    repo.findBookById.mockResolvedValue(null);

    await expect(service.getBookById("missing-book")).rejects.toMatchObject({
      code: "BOOK_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("createBook() should delegate to repository", async () => {
    repo.createBook.mockResolvedValue({
      id: "b-1",
      title: "Dune",
      author: "Frank Herbert",
      description: "Sci-fi classic",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      epubPath: null,
    });

    const result = await service.createBook({
      title: "Dune",
      author: "Frank Herbert",
      description: "Sci-fi classic",
    });

    expect(repo.createBook).toHaveBeenCalledWith({
      title: "Dune",
      author: "Frank Herbert",
      description: "Sci-fi classic",
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "b-1",
        title: "Dune",
        hasEpub: false,
      })
    );
  });

  it("uploadEpub() should fail when book does not exist", async () => {
    repo.findBookById.mockResolvedValue(null);

    const req = {
      file: vi.fn(),
    };

    await expect(service.uploadEpub(req as any, "missing-book")).rejects.toMatchObject({
      code: "BOOK_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("uploadEpub() should fail when file is missing", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
    });

    const req = {
      file: vi.fn().mockResolvedValue(undefined),
    };

    await expect(service.uploadEpub(req as any, "b-1")).rejects.toMatchObject({
      code: "NO_FILES_UPLOADED",
      statusCode: 400,
    });
  });

  it("uploadEpub() should fail for invalid non-epub file", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
    });

    const req = {
      file: vi.fn().mockResolvedValue({
        filename: "book.pdf",
        mimetype: "application/pdf",
        file: Readable.from(["dummy"]),
      }),
    };

    await expect(service.uploadEpub(req as any, "b-1")).rejects.toMatchObject({
      code: "INVALID_PARAMS",
      statusCode: 400,
    });
  });

  it("uploadEpub() should save epub and persist relative path", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
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
