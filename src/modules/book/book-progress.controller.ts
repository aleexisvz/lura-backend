import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BookProgressService } from "./book-progress.service.js";

const BookIdParamsSchema = z.object({
  bookId: z.string().trim().min(1),
});

// Lenient on purpose: values are normalized instead of rejected, so the request
// never fails on a bad number or a long string, and the contract stays the same.
// Malformed fields fall back to undefined (the service then keeps the stored value).

// Largest value a PostgreSQL integer column accepts.
const MAX_DB_INT = 2147483647;

const toDbInt = (value: number) => Math.min(MAX_DB_INT, Math.max(0, Math.round(value)));

const optionalNumber = z.coerce.number().finite().optional().catch(undefined);
const optionalDbInt = z.coerce
  .number()
  .finite()
  .transform(toDbInt)
  .optional()
  .catch(undefined);

const optionalText = (maxLength: number) =>
  z
    .string()
    .transform((value) => value.slice(0, maxLength))
    .optional()
    .catch(undefined);

const SaveBookProgressSchema = z.object({
  spineIndex: optionalDbInt,
  sectionHref: optionalText(2000),
  locator: optionalText(2000),
  progressPercent: optionalNumber,
  currentPage: optionalDbInt,
  totalPages: optionalDbInt,
  title: optionalText(500),
  coverUrl: z
    .string()
    .transform((value) => value.slice(0, 2000))
    .nullable()
    .optional()
    .catch(undefined),
  chapterTitle: optionalText(500),
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
