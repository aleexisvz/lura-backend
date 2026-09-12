import fs from "node:fs";
import path from "node:path";

export interface BookProgressRecord {
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
  completed?: boolean | undefined;
  completedAt?: string | null | undefined;
  updatedAt: string;
}

class BookProgressStore {
  private store = new Map<string, BookProgressRecord>();
  private filePath = path.resolve(process.cwd(), "storage", "book-progress.json");

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const entries: [string, BookProgressRecord][] = JSON.parse(raw);
        if (Array.isArray(entries)) {
          this.store = new Map(entries);
        }
      }
    } catch {
      // ignore
    }
  }

  private saveToDisk() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.store.entries()), null, 2);
      fs.writeFileSync(this.filePath, data, "utf-8");
    } catch {
      // ignore
    }
  }

  save(
    userId: string,
    bookId: string,
    data: Omit<BookProgressRecord, "userId" | "bookId" | "updatedAt">
  ): BookProgressRecord {
    const key = `${userId}:${bookId}`;
    const existing = this.store.get(key);
    const progressPercent = Math.min(100, Math.max(0, Number(data.progressPercent) || 0));
    const currentPage = data.currentPage !== undefined ? Number(data.currentPage) : existing?.currentPage;
    const incomingTotal = data.totalPages !== undefined ? Number(data.totalPages) : undefined;
    const existingTotal =
      typeof existing?.totalPages === "number" && existing.totalPages > 1
        ? existing.totalPages
        : undefined;

    // Protect against downgrading a valid book total (e.g. 835) with a transient chapter count (e.g. 15)
    // emitted by epub.js before the full book pagination has finished computing.
    const totalPages =
      typeof incomingTotal === "number" && incomingTotal > 1
        ? existingTotal && existingTotal > incomingTotal
          ? existingTotal
          : incomingTotal
        : existingTotal;

    // A book is marked complete if explicitly flagged, if reading percentage hits 100%,
    // or if the reader reaches/exceeds total pages with at least 95% overall book progress.
    const isCompleted =
      data.completed === true ||
      progressPercent >= 100 ||
      (typeof currentPage === "number" &&
        typeof totalPages === "number" &&
        totalPages > 1 &&
        currentPage >= totalPages &&
        progressPercent >= 95);

    const record: BookProgressRecord = {
      userId,
      bookId,
      spineIndex: Number(data.spineIndex) || 0,
      sectionHref: String(data.sectionHref || ""),
      locator: String(data.locator || ""),
      progressPercent,
      currentPage,
      totalPages,
      title: data.title || existing?.title || undefined,
      coverUrl: data.coverUrl !== undefined ? data.coverUrl : (existing?.coverUrl || undefined),
      chapterTitle: data.chapterTitle || existing?.chapterTitle || undefined,
      completed: isCompleted,
      completedAt: isCompleted ? (existing?.completedAt || new Date().toISOString()) : null,
      updatedAt: new Date().toISOString(),
    };
    // Primary index isolated by user and book
    this.store.set(key, record);
    // Secondary fallback index by bookId for backward compatibility with un-scoped queries
    this.store.set(bookId, record);
    this.saveToDisk();
    return record;
  }

  get(userId: string, bookId: string): BookProgressRecord | null {
    const key = `${userId}:${bookId}`;
    return this.store.get(key) || this.store.get(bookId) || null;
  }

  getAllForUser(userId: string): BookProgressRecord[] {
    const result: BookProgressRecord[] = [];
    const seen = new Set<string>();
    for (const [key, value] of this.store.entries()) {
      if (value.userId === userId) {
        if (!seen.has(value.bookId)) {
          seen.add(value.bookId);
          result.push(value);
        }
      }
    }
    return result;
  }

  countCompletedBooksForUser(userId: string): number {
    const books = this.getAllForUser(userId);
    return books.filter(
      (b) =>
        b.completed === true ||
        (b.progressPercent ?? 0) >= 100 ||
        (typeof b.currentPage === "number" &&
          typeof b.totalPages === "number" &&
          b.totalPages > 1 &&
          b.currentPage >= b.totalPages)
    ).length;
  }

  sumPagesForUser(userId: string): number {
    const books = this.getAllForUser(userId);
    return books.reduce((sum, b) => sum + (b.currentPage ?? 1), 0);
  }
}

export const bookProgressStore = new BookProgressStore();
