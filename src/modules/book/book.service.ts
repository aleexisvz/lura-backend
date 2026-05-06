import { notFound } from "../../shared/errors/error-factory.js";
import { BookRepository } from "./book.repository.js";
import type { CreateBookDTO } from "./book.types.js";

export class BookService {
  constructor(private repo: BookRepository) {}

  async getAllBooks() {
    return this.repo.findAllBooks();
  }

  async getBookById(bookId: string) {
    const book = await this.repo.findBookById(bookId);

    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    return book;
  }

  async createBook(data: CreateBookDTO) {
    return this.repo.createBook(data);
  }
}
