import path from "node:path";
import type { FastifyRequest } from "fastify";
import { notFound } from "../../shared/errors/error-factory.js";
import { badRequest } from "../../shared/errors/error-factory.js";
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js";
import { BookRepository } from "./book.repository.js";
import type { CreateBookDTO, PublicBookDTO } from "./book.types.js";

export class BookService {
  constructor(
    private repo: BookRepository,
    private storage: LocalStorageService
  ) {}

  async getAllBooks() {
    const books = await this.repo.findAllBooks();
    return books.map((book) => this.toPublicBook(book));
  }

  async getBookById(bookId: string) {
    const book = await this.repo.findBookById(bookId);

    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    return this.toPublicBook(book);
  }

  async createBook(data: CreateBookDTO) {
    const created = await this.repo.createBook(data);
    return this.toPublicBook(created);
  }

  async uploadEpub(req: FastifyRequest, bookId: string) {
    const book = await this.repo.findBookById(bookId);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    let file: Awaited<ReturnType<FastifyRequest["file"]>>;
    try {
      file = await req.file();
    } catch {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    if (!file) {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    const isEpubMime = file.mimetype === "application/epub+zip";
    const hasEpubExtension = path.extname(file.filename ?? "").toLowerCase() === ".epub";

    if (!isEpubMime && !hasEpubExtension) {
      throw badRequest("INVALID_PARAMS", "Invalid EPUB file");
    }

    const absolutePath = this.storage.resolveBookEpubPath(bookId);
    const absoluteDir = path.dirname(absolutePath);

    await this.storage.ensureDir(absoluteDir);
    await this.storage.saveStream(file.file, absolutePath);

    const relativePath = path.posix.join("books", bookId, "book.epub");
    await this.repo.updateBookEpubPath(bookId, relativePath);

    return { uploaded: true };
  }

  private toPublicBook(book: {
    id: string;
    title: string;
    author: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    epubPath: string | null;
  }): PublicBookDTO {
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      hasEpub: Boolean(book.epubPath),
    };
  }
}
