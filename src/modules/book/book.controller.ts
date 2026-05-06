import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BookService } from "./book.service.js";

const BookIdParamsSchema = z.object({
  bookId: z.string().trim().min(1),
});

const CreateBookSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

export class BookController {
  constructor(private service: BookService) {}

  getAllBooks = async (_req: FastifyRequest, reply: FastifyReply) => {
    const books = await this.service.getAllBooks();
    return reply.send(books);
  };

  getBookById = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const book = await this.service.getBookById(bookId);
    return reply.send(book);
  };

  createBook = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = CreateBookSchema.parse(req.body);
    const book = await this.service.createBook(body);
    return reply.send(book);
  };

  uploadEpub = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const result = await this.service.uploadEpub(req, bookId);
    return reply.send(result);
  };
}
