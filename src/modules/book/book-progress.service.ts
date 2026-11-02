import type { BookProgress } from "@prisma/client";
import { notFound } from "../../shared/errors/error-factory.js";
import { BookProgressRepository, type BookProgressWriteData } from "./book-progress.repository.js";

export type SaveBookProgressInput = {
  spineIndex: number;
  sectionHref: string;
  locator: string;
  progressPercent: number;
  currentPage?: number | undefined;
  totalPages?: number | undefined;
  title?: string | undefined;
  coverUrl?: string | null | undefined;
  chapterTitle?: string | undefined;
  completed: boolean;
};

export type BookProgressDTO = {
  userId: string;
  bookId: string;
  spineIndex: number;
  sectionHref: string;
  locator: string;
  progressPercent: number;
  currentPage?: number | undefined;
  totalPages?: number | undefined;
  title?: string | undefined;
  coverUrl?: string | null | undefined;
  chapterTitle?: string | undefined;
  completed: boolean;
  completedAt: string | null;
  updatedAt: string;
};

function toDTO(row: BookProgress): BookProgressDTO {
  return {
    userId: row.userId,
    bookId: row.bookId,
    spineIndex: row.spineIndex,
    sectionHref: row.sectionHref,
    locator: row.locator,
    progressPercent: row.progressPercent,
    currentPage: row.currentPage ?? undefined,
    totalPages: row.totalPages ?? undefined,
    title: row.title ?? undefined,
    coverUrl: row.coverUrl ?? undefined,
    chapterTitle: row.chapterTitle ?? undefined,
    completed: row.completed,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class BookProgressService {
  constructor(private repo: BookProgressRepository = new BookProgressRepository()) {}

  async getProgress(userId: string, bookId: string): Promise<BookProgressDTO | null> {
    const progress = await this.repo.findByUserAndBook(userId, bookId);
    return progress ? toDTO(progress) : null;
  }

  async saveProgress(
    userId: string,
    bookId: string,
    input: SaveBookProgressInput
  ): Promise<BookProgressDTO> {
    const book = await this.repo.bookExists(bookId);
    if (!book) {
      throw notFound("BOOK_NOT_FOUND", "Book not found");
    }

    const existing = await this.repo.findByUserAndBook(userId, bookId);
    const now = new Date();

    const progressPercent = Math.min(100, Math.max(0, Number(input.progressPercent) || 0));
    const currentPage =
      input.currentPage !== undefined ? input.currentPage : (existing?.currentPage ?? undefined);

    // Protect against downgrading a valid book total (e.g. 835) with a transient chapter count (e.g. 15)
    // emitted by epub.js before the full book pagination has finished computing.
    const incomingTotal = input.totalPages;
    const existingTotal =
      typeof existing?.totalPages === "number" && existing.totalPages > 1
        ? existing.totalPages
        : undefined;
    const totalPages =
      typeof incomingTotal === "number" && incomingTotal > 1
        ? existingTotal && existingTotal > incomingTotal
          ? existingTotal
          : incomingTotal
        : existingTotal;

    // Completed if previously completed, if explicitly flagged, if progress hits 100%,
    // or if the reader reaches the last page with at least 95% overall progress.
    const isCompleted =
      existing?.completed === true ||
      input.completed === true ||
      progressPercent >= 100 ||
      (typeof currentPage === "number" &&
        typeof totalPages === "number" &&
        totalPages > 1 &&
        currentPage >= totalPages &&
        progressPercent >= 95);

    const data: BookProgressWriteData = {
      spineIndex: Number(input.spineIndex) || 0,
      sectionHref: String(input.sectionHref || ""),
      locator: String(input.locator || ""),
      progressPercent,
      currentPage: currentPage ?? null,
      totalPages: totalPages ?? null,
      title: input.title || existing?.title || null,
      coverUrl: input.coverUrl !== undefined ? input.coverUrl || null : (existing?.coverUrl ?? null),
      chapterTitle: input.chapterTitle || existing?.chapterTitle || null,
      completed: isCompleted,
      completedAt: isCompleted ? (existing?.completedAt ?? now) : null,
      updatedAt: now,
    };

    const saved = await this.repo.upsert(userId, bookId, data);
    return toDTO(saved);
  }

  // Reading statistics. Results match the former in-memory store.
  sumPagesForUser(userId: string) {
    return this.repo.sumPagesByUser(userId);
  }

  countCompletedForUser(userId: string) {
    return this.repo.countCompletedByUser(userId);
  }

  async findInProgressForUser(userId: string, limit: number) {
    const rows = await this.repo.findInProgressByUser(userId, limit);
    return rows.map(toDTO);
  }
}
