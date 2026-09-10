import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/http/auth.js";
import { requireAdmin } from "../../shared/http/requiereAdmin.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { BookController } from "./book.controller.js";
import { BookRepository } from "./book.repository.js";
import { BookService } from "./book.service.js";
import { TagsRepository } from "../tags/tags.repository.js";

export async function bookRoutes(app: FastifyInstance) {
  const repo = new BookRepository();
  const storage = new CloudStorageService();
  const tagsRepo = new TagsRepository();
  const service = new BookService(repo, storage, tagsRepo);
  const controller = new BookController(service);

  app.post("/", { preHandler: requireAdmin }, controller.createBook);
  app.patch("/:bookId", { preHandler: requireAdmin }, controller.updateBook);
  app.post("/:bookId/upload-epub", { preHandler: requireAdmin }, controller.uploadEpub);
  app.post("/:bookId/upload-cover", { preHandler: requireAdmin }, controller.uploadBookCover);
  app.get("/", { preHandler: requireAuth }, controller.getAllBooks);
  app.get("/:bookId", { preHandler: requireAuth }, controller.getBookById);
  app.get("/:bookId/file", { preHandler: requireAuth }, controller.getBookFile);
}
