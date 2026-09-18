import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/http/auth.js";
import { requireAdmin } from "../../shared/http/requiereAdmin.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { BookController } from "./book.controller.js";
import { BookRepository } from "./book.repository.js";
import { BookService } from "./book.service.js";
import { TagsRepository } from "../tags/tags.repository.js";

import { bookProgressStore } from "./book-progress.store.js";

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
  app.get("/rankings", { preHandler: requireAuth }, controller.getRankings);
  app.get("/:bookId", { preHandler: requireAuth }, controller.getBookById);
  app.get("/:bookId/file", { preHandler: requireAuth }, controller.getBookFile);

  app.get("/:bookId/progress", { preHandler: requireAuth }, async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const userId = (req.user as any)?.sub || (req.user as any)?.id || "anon";
    const progress = bookProgressStore.get(userId, bookId);
    if (!progress) {
      return reply.send(null);
    }
    return reply.send(progress);
  });

  app.put("/:bookId/progress", { preHandler: requireAuth }, async (req, reply) => {
    const { bookId } = req.params as { bookId: string };
    const userId = (req.user as any)?.sub || (req.user as any)?.id || "anon";
    const body = req.body as any;
    const record = bookProgressStore.save(userId, bookId, {
      spineIndex: Number(body?.spineIndex) || 0,
      sectionHref: String(body?.sectionHref || ""),
      locator: String(body?.locator || ""),
      progressPercent: Math.min(100, Math.max(0, Number(body?.progressPercent) || 0)),
      currentPage: body?.currentPage !== undefined ? Number(body.currentPage) : undefined,
      totalPages: body?.totalPages !== undefined ? Number(body.totalPages) : undefined,
      title: body?.title ? String(body.title) : undefined,
      coverUrl: body?.coverUrl !== undefined ? (body.coverUrl ? String(body.coverUrl) : null) : undefined,
      chapterTitle: body?.chapterTitle ? String(body.chapterTitle) : undefined,
      completed: body?.completed === true,
    });
    return reply.send(record);
  });
}
