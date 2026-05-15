import { prisma } from "../../infrastructure/database/prisma.js";
import type { CreateBookDTO, UpdateBookDTO } from "./book.types.js";

export class BookRepository {
  findAllBooks(categories: string[] = []) {
    return prisma.book.findMany({
      where: categories.length > 0 ? { categories: { hasSome: categories } } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  findBookById(id: string) {
    return prisma.book.findUnique({
      where: { id },
    });
  }

  createBook(data: CreateBookDTO) {
    return prisma.book.create({
      data,
    });
  }

  updateBook(bookId: string, data: UpdateBookDTO) {
    return prisma.book.update({
      where: { id: bookId },
      data,
    });
  }

  updateBookEpubPath(bookId: string, epubPath: string) {
    return prisma.book.update({
      where: { id: bookId },
      data: { epubPath },
    });
  }

  updateBookCoverPath(bookId: string, coverPath: string) {
    return prisma.book.update({
      where: { id: bookId },
      data: { coverPath },
    });
  }
}
