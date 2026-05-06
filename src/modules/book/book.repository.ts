import { prisma } from "../../infrastructure/database/prisma.js";
import type { CreateBookDTO } from "./book.types.js";

export class BookRepository {
  findAllBooks() {
    return prisma.book.findMany({
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
}
