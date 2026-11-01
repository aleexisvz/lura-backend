import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import path from "node:path";
import { BookService, EPUB_CACHE_MAX_BYTES } from "../../../src/modules/book/book.service.js";

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
    saveStream: vi.fn(),
    getPublicUrl: vi.fn((p) => `https://cdn.example.com/${p}`),
    createReadStream: vi.fn(),
    getFileBuffer: vi.fn(),
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

    expect(storage.saveStream).toHaveBeenCalledWith(
      fileStream,
      absolutePath,
      "application/epub+zip"
    );
    expect(repo.updateBookEpubPath).toHaveBeenCalledWith("b-1", "books/b-1/book.epub");
    expect(result).toEqual({ uploaded: true });
  });

  it("getBookFile() should return buffer and cache it", async () => {
    repo.findBookById.mockResolvedValue({
      id: "b-1",
      title: "Dune",
      epubPath: "books/b-1/book.epub",
    });
    const fakeBuffer = Buffer.from("fake-epub-data");
    storage.getFileBuffer.mockResolvedValue(fakeBuffer);

    const firstCall = await service.getBookFile("b-1");
    expect(firstCall).toEqual({
      buffer: fakeBuffer,
      filename: "Dune.epub",
    });
    expect(storage.getFileBuffer).toHaveBeenCalledTimes(1);

    // Second call should hit in-memory cache without calling storage again
    const secondCall = await service.getBookFile("b-1");
    expect(secondCall).toEqual({
      buffer: fakeBuffer,
      filename: "Dune.epub",
    });
    expect(storage.getFileBuffer).toHaveBeenCalledTimes(1);
  });

  describe("EPUB cache limits", () => {
    // One shared buffer is enough: the cache counts buffer.length, not identity.
    const sizedBuffer = (fraction: number) => Buffer.alloc(Math.floor(EPUB_CACHE_MAX_BYTES * fraction));

    const useBooks = () =>
      repo.findBookById.mockImplementation(async (id: string) => ({
        id,
        title: id,
        epubPath: `books/${id}/book.epub`,
        bookTags: [],
      }));

    const upload = (bookId: string) => {
      storage.resolveBookEpubPath.mockReturnValue(`/storage/books/${bookId}/book.epub`);
      const req = {
        file: vi.fn().mockResolvedValue({
          filename: "book.epub",
          mimetype: "application/epub+zip",
          file: Readable.from(["bytes"]),
        }),
      };
      return service.uploadEpub(req as any, bookId);
    };

    it("evicts the least recently used EPUB when the byte budget is exceeded", async () => {
      useBooks();
      storage.getFileBuffer.mockResolvedValue(sizedBuffer(0.6));

      await service.getBookFile("a"); // cache: a (60%)
      await service.getBookFile("b"); // 120% > 100%: evicts a
      await service.getBookFile("b"); // hit
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(2);

      await service.getBookFile("a"); // a was evicted: read again, evicts b
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(3);
    });

    it("refreshes a book on access, so the untouched one is evicted first", async () => {
      useBooks();
      storage.getFileBuffer.mockResolvedValue(sizedBuffer(0.3));

      await service.getBookFile("a");
      await service.getBookFile("b");
      await service.getBookFile("c"); // 90%, all fit
      await service.getBookFile("a"); // hit: a becomes most recent (order b, c, a)
      await service.getBookFile("d"); // 120%: evicts b, the least recent
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(4);

      await service.getBookFile("a"); // hit
      await service.getBookFile("c"); // hit
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(4);

      await service.getBookFile("b"); // miss
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(5);
    });

    it("serves but does not cache a file larger than the whole budget", async () => {
      useBooks();
      storage.getFileBuffer.mockResolvedValue({ length: EPUB_CACHE_MAX_BYTES + 1 } as Buffer);

      await service.getBookFile("a");
      await service.getBookFile("a");
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(2);
    });

    it("uploadEpub() drops the cached EPUB, so the next read returns the new file", async () => {
      useBooks();
      storage.getFileBuffer.mockResolvedValue(Buffer.from("old-epub"));
      await service.getBookFile("a");

      await upload("a");

      storage.getFileBuffer.mockResolvedValue(Buffer.from("new-epub"));
      const after = await service.getBookFile("a");
      expect(after.buffer.toString()).toBe("new-epub");
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(2);
    });

    it("does not cache a read that started before an upload finished", async () => {
      useBooks();
      let finishRead!: (buffer: Buffer) => void;
      storage.getFileBuffer.mockReturnValueOnce(
        new Promise<Buffer>((resolve) => {
          finishRead = resolve;
        })
      );

      const pending = service.getBookFile("a");
      await vi.waitFor(() => expect(storage.getFileBuffer).toHaveBeenCalledTimes(1));

      await upload("a");
      finishRead(Buffer.from("old-epub"));
      await pending;

      storage.getFileBuffer.mockResolvedValue(Buffer.from("new-epub"));
      const after = await service.getBookFile("a");
      expect(after.buffer.toString()).toBe("new-epub");
      expect(storage.getFileBuffer).toHaveBeenCalledTimes(2);
    });
  });
});
