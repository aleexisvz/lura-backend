import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BookService } from "./book.service.js";

const tagIdsSchema = z.array(z.string().trim().min(1)).max(100);

const BookIdParamsSchema = z.object({
  bookId: z.string().trim().min(1),
});

const ListBooksQuerySchema = z.object({
  tagIds: z.string().optional(),
});

const CreateBookSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  tagIds: tagIdsSchema.optional(),
});

const UpdateBookSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    author: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    tagIds: tagIdsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export class BookController {
  constructor(private service: BookService) {}

  getAllBooks = async (req: FastifyRequest, reply: FastifyReply) => {
    const { tagIds } = ListBooksQuerySchema.parse(req.query);
    const parsedTagIds = tagIds
      ? tagIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const books = await this.service.getAllBooks(parsedTagIds);
    return reply.send(books);
  };

  getBookById = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const book = await this.service.getBookById(bookId);
    return reply.send(book);
  };

  getBookFile = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const { buffer, filename } = await this.service.getBookFile(bookId);
    return reply
      .header("Content-Type", "application/epub+zip")
      .header("Content-Length", buffer.length)
      .header("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`)
      .header("Cache-Control", "public, max-age=86400, immutable")
      .send(buffer);
  };

  createBook = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = CreateBookSchema.parse(req.body);
    const book = await this.service.createBook({
      title: body.title,
      ...(body.author !== undefined ? { author: body.author } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      tagIds: body.tagIds ?? [],
    });
    return reply.send(book);
  };

  updateBook = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const body = UpdateBookSchema.parse(req.body);
    const payload = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.author !== undefined ? { author: body.author } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.tagIds !== undefined ? { tagIds: body.tagIds } : {}),
    };
    const book = await this.service.updateBook(bookId, payload);
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

}
