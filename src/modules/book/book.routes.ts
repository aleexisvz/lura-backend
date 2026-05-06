import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/http/auth.js";
import { requireAdmin } from "../../shared/http/requiereAdmin.js";
import { BookController } from "./book.controller.js";
import { BookRepository } from "./book.repository.js";
import { BookService } from "./book.service.js";

export async function bookRoutes(app: FastifyInstance) {
  const repo = new BookRepository();
  const service = new BookService(repo);
  const controller = new BookController(service);

  app.post("/", { preHandler: requireAdmin }, controller.createBook);
  app.get("/", { preHandler: requireAuth }, controller.getAllBooks);
  app.get("/:bookId", { preHandler: requireAuth }, controller.getBookById);
}
