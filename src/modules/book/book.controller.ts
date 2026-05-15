import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BookService } from "./book.service.js";

const categorySchema = z.string().trim().min(1).max(50);
const categoriesSchema = z.array(categorySchema).max(20);

const BookIdParamsSchema = z.object({
  bookId: z.string().trim().min(1),
});

const ListBooksQuerySchema = z.object({
  categories: z.string().optional(),
});

const CreateBookSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  categories: categoriesSchema.optional(),
});

const UpdateBookSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    author: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    categories: categoriesSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export class BookController {
  constructor(private service: BookService) {}

  getAllBooks = async (req: FastifyRequest, reply: FastifyReply) => {
    const { categories } = ListBooksQuerySchema.parse(req.query);
    const categoryList = categories
      ? categories
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const books = await this.service.getAllBooks(categoryList);
    return reply.send(books);
  };

  getBookById = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const book = await this.service.getBookById(bookId);
    return reply.send(book);
  };

  createBook = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = CreateBookSchema.parse(req.body);
    const book = await this.service.createBook({
      title: body.title,
      ...(body.author !== undefined ? { author: body.author } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      categories: body.categories ?? [],
    });
    return reply.send(book);
  };

  updateBook = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const body = UpdateBookSchema.parse(req.body);
    const book = await this.service.updateBook(bookId, body);
    return reply.send(book);
  };

  uploadEpub = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const result = await this.service.uploadEpub(req, bookId);
    return reply.send(result);
  };

  uploadBookCover = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const result = await this.service.uploadBookCover(req, bookId);
    return reply.send(result);
  };

  streamBookCover = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    return this.service.streamBookCover(reply, bookId);
  };
}
