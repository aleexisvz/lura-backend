import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BookProgressService } from "./book-progress.service.js";

const BookIdParamsSchema = z.object({
  bookId: z.string().trim().min(1),
});

// Lenient on purpose: malformed fields fall back to defaults instead of rejecting
// the request, matching how the progress endpoint has always parsed its body.
const optionalNumber = z.coerce.number().finite().optional().catch(undefined);
const optionalText = z.string().optional().catch(undefined);

const SaveBookProgressSchema = z.object({
  spineIndex: optionalNumber,
  sectionHref: optionalText,
  locator: optionalText,
  progressPercent: optionalNumber,
  currentPage: optionalNumber,
  totalPages: optionalNumber,
  title: optionalText,
  coverUrl: z.string().nullable().optional().catch(undefined),
  chapterTitle: optionalText,
  completed: z.boolean().optional().catch(undefined),
});

export class BookProgressController {
  constructor(private service: BookProgressService) {}

  getProgress = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const userId = req.user.sub;
    const progress = await this.service.getProgress(userId, bookId);
    return reply.send(progress);
  };

  saveProgress = async (req: FastifyRequest, reply: FastifyReply) => {
    const { bookId } = BookIdParamsSchema.parse(req.params);
    const userId = req.user.sub;
    const body = SaveBookProgressSchema.parse(req.body ?? {});
    const record = await this.service.saveProgress(userId, bookId, {
      ...body,
      spineIndex: body.spineIndex ?? 0,
      sectionHref: body.sectionHref ?? "",
      locator: body.locator ?? "",
      progressPercent: body.progressPercent ?? 0,
      completed: body.completed === true,
    });
    return reply.send(record);
  };
}
