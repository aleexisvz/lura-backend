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
    const currentPage = data.currentPage !== undefined ? Number(data.currentPage) : undefined;
    const totalPages = data.totalPages !== undefined ? Number(data.totalPages) : undefined;

    const isCompleted =
      data.completed === true ||
      progressPercent >= 100 ||
      (typeof currentPage === "number" &&
        typeof totalPages === "number" &&
        totalPages > 1 &&
        currentPage >= totalPages) ||
      Boolean(existing?.completed);

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
    this.store.set(key, record);
    // Also save under bookId for fallback lookups
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
      if (value.userId === userId || (!key.includes(":") && key === value.bookId)) {
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
