import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookService } from "../../../src/modules/book/book.service.js";

describe("BookService (unit)", () => {
  const repo = {
    findAllBooks: vi.fn(),
    findBookById: vi.fn(),
    createBook: vi.fn(),
  };

  let service: BookService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BookService(repo as any);
  });

  it("getAllBooks() should return repository list", async () => {
    repo.findAllBooks.mockResolvedValue([{ id: "b-1", title: "Dune" }]);

    const result = await service.getAllBooks();

    expect(repo.findAllBooks).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: "b-1", title: "Dune" }]);
  });

  it("getBookById() should return existing book", async () => {
    repo.findBookById.mockResolvedValue({ id: "b-1", title: "Dune" });

    const result = await service.getBookById("b-1");

    expect(repo.findBookById).toHaveBeenCalledWith("b-1");
    expect(result).toEqual({ id: "b-1", title: "Dune" });
  });

  it("getBookById() should throw BOOK_NOT_FOUND when book does not exist", async () => {
    repo.findBookById.mockResolvedValue(null);

    await expect(service.getBookById("missing-book")).rejects.toMatchObject({
      code: "BOOK_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("createBook() should delegate to repository", async () => {
    repo.createBook.mockResolvedValue({ id: "b-1", title: "Dune" });

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
    expect(result).toEqual({ id: "b-1", title: "Dune" });
  });
});
