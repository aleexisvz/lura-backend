import type { TagScope } from "@prisma/client";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { notFound, badRequest } from "../../shared/errors/error-factory.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { BookRepository } from "./book.repository.js";
import type { CreateBookDTO, PublicBookDTO, UpdateBookDTO } from "./book.types.js";
import { TagsRepository } from "../tags/tags.repository.js";

export class BookService {
  constructor(
    private repo: BookRepository,
    private storage: CloudStorageService,
    private tagsRepo: TagsRepository
  ) {}

  async getAllBooks(tagIds: string[] = []) {
    const books = await this.repo.findAllBooks(tagIds);
    return books.map((book) => this.toPublicBook(book));
  }

  async getBookById(bookId: string) {
    const book = await this.repo.findBookById(bookId);

    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    return this.toPublicBook(book);
  }

  async getBookFile(bookId: string) {
    const book = await this.repo.findBookById(bookId);

    if (!book || !book.epubPath) {
      throw notFound("BOOK_NOT_FOUND", "Book or EPUB file not found");
    }

    const stream = await this.storage.createReadStream(book.epubPath);
    return {
      stream,
      filename: `${book.title}.epub`,
    };
  }

  async createBook(data: CreateBookDTO) {
    const validTagIds = await this.assertTagIdsForScope(data.tagIds ?? [], "BOOK");
    const created = await this.repo.createBook({
      ...data,
      tagIds: validTagIds,
    });
    return this.toPublicBook(created);
  }

  async updateBook(bookId: string, data: UpdateBookDTO) {
    const existing = await this.repo.findBookById(bookId);
    if (!existing) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    const validTagIds =
      data.tagIds !== undefined ? await this.assertTagIdsForScope(data.tagIds, "BOOK") : undefined;

    const updated = await this.repo.updateBook(bookId, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.author !== undefined ? { author: data.author } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(validTagIds !== undefined ? { tagIds: validTagIds } : {}),
    });

    return this.toPublicBook(updated);
  }

  async uploadEpub(req: FastifyRequest, bookId: string) {
    const book = await this.repo.findBookById(bookId);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    const file = await this.getRequiredFile(req);
    const isEpubMime = file.mimetype === "application/epub+zip";
    const hasEpubExtension = path.extname(file.filename ?? "").toLowerCase() === ".epub";

    if (!isEpubMime && !hasEpubExtension) {
      throw badRequest("INVALID_PARAMS", "Invalid EPUB file");
    }

    const absolutePath = this.storage.resolveBookEpubPath(bookId);

    await this.storage.saveStream(file.file, absolutePath, "application/epub+zip");

    const relativePath = path.posix.join("books", bookId, "book.epub");
    await this.repo.updateBookEpubPath(bookId, relativePath);

    return { uploaded: true };
  }

  async uploadBookCover(req: FastifyRequest, bookId: string) {
    const book = await this.repo.findBookById(bookId);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    const file = await this.getRequiredFile(req);
    const extension = this.resolveCoverExtension(file.filename, file.mimetype);
    const coverDir = this.storage.resolveBookCoverDir(bookId);
    const absolutePath = this.storage.resolveBookCoverPath(bookId, extension);
    const relativePath = path.posix.join("books", bookId, "cover", `cover${extension}`);
    const contentType = file.mimetype || (extension === ".webp" ? "image/webp" : extension === ".png" ? "image/png" : "image/jpeg");

    await this.storage.removeFilesByPrefix(coverDir, "cover.");
    await this.storage.saveStream(file.file, absolutePath, contentType);
    await this.repo.updateBookCoverPath(bookId, relativePath);

    return { uploaded: true };
  }



  private async assertTagIdsForScope(tagIds: string[], scope: TagScope) {
    if (tagIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(tagIds));
    const tags = await this.tagsRepo.findByIds(uniqueIds);

    if (tags.length !== uniqueIds.length) {
      throw badRequest("TAG_NOT_FOUND", "One or more tags do not exist");
    }

    const invalidTag = tags.find((tag) => tag.scope !== scope);
    if (invalidTag) {
      throw badRequest("TAG_SCOPE_MISMATCH", "One or more tags have invalid scope");
    }

    return uniqueIds;
  }

  private async getRequiredFile(req: FastifyRequest) {
    let file: Awaited<ReturnType<FastifyRequest["file"]>>;
    try {
      file = await req.file();
    } catch {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    if (!file) {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    return file;
  }

  private resolveCoverExtension(filename: string | undefined, mimetype: string) {
    const ext = path.extname(filename ?? "").toLowerCase();
    if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
      return ext;
    }

    if (mimetype === "image/png") return ".png";
    if (mimetype === "image/jpeg") return ".jpeg";
    if (mimetype === "image/webp") return ".webp";

    throw badRequest("INVALID_PARAMS", "Invalid image file");
  }

  private toPublicBook(book: {
    id: string;
    title: string;
    author: string | null;
    description: string | null;
    coverPath: string | null;
    createdAt: Date;
    updatedAt: Date;
    epubPath: string | null;
    bookTags?: Array<{
      Tag: {
        id: string;
        name: string;
        slug: string;
      };
    }>;
  }): PublicBookDTO {
    const tags = (book.bookTags ?? []).map((bookTag) => ({
      id: bookTag.Tag.id,
      name: bookTag.Tag.name,
      slug: bookTag.Tag.slug,
    }));

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      tags,
      categories: tags.map((tag) => tag.name),
      coverUrl: book.coverPath ? this.storage.getPublicUrl(book.coverPath) : null,
      epubUrl: book.epubPath ? this.storage.getPublicUrl(book.epubPath) : null,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
      hasEpub: Boolean(book.epubPath),
      readerStatus: "READY",
    };
  }
}
