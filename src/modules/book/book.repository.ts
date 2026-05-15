import { prisma } from "../../infrastructure/database/prisma.js";
import type { CreateBookDTO, UpdateBookDTO } from "./book.types.js";

const bookWithTagsInclude = {
  bookTags: {
    include: {
      Tag: true,
    },
  },
} as const;

export class BookRepository {
  findAllBooks(tagIds: string[] = []) {
    return prisma.book.findMany({
      ...(tagIds.length > 0
        ? {
            where: {
              bookTags: {
                some: {
                  tagId: { in: tagIds },
                },
              },
            },
          }
        : {}),
      include: bookWithTagsInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findBookById(id: string) {
    return prisma.book.findUnique({
      where: { id },
      include: bookWithTagsInclude,
    });
  }

  createBook(data: CreateBookDTO) {
    return prisma.book.create({
      data: {
        title: data.title,
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.tagIds !== undefined
          ? {
              bookTags: {
                createMany: {
                  data: data.tagIds.map((tagId) => ({ tagId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: bookWithTagsInclude,
    });
  }

  updateBook(bookId: string, data: UpdateBookDTO) {
    return prisma.book.update({
      where: { id: bookId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.author !== undefined ? { author: data.author } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.tagIds !== undefined
          ? {
              bookTags: {
                deleteMany: {},
                createMany: {
                  data: data.tagIds.map((tagId) => ({ tagId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: bookWithTagsInclude,
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
