/**
 * One-off: copies book reading progress from the legacy JSON store
 * (storage/book-progress.json) into the BookProgress table.
 *
 * - Ignores the legacy bookId-only keys (they were a cross-user fallback).
 * - Keeps the most recently updated record per userId:bookId.
 * - Skips records whose user or book no longer exists.
 * - Upserts, so it is safe to run more than once.
 * - Never modifies the JSON file.
 *
 * Usage:
 *   npx tsx scripts/migrate-book-progress-json.ts --dry-run
 *   npx tsx scripts/migrate-book-progress-json.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/infrastructure/database/prisma.js";

type LegacyRecord = {
  userId?: string;
  bookId?: string;
  spineIndex?: number;
  sectionHref?: string;
  locator?: string;
  progressPercent?: number;
  currentPage?: number | null;
  totalPages?: number | null;
  title?: string | null;
  coverUrl?: string | null;
  chapterTitle?: string | null;
  completed?: boolean;
  completedAt?: string | null;
  updatedAt?: string;
};

const dryRun = process.argv.includes("--dry-run");
const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const filePath = path.resolve(fileArg ?? path.join("storage", "book-progress.json"));

function toDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toInt(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function loadLatestRecords() {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`Expected an array of [key, record] entries in ${filePath}`);
  }

  const latest = new Map<string, { record: LegacyRecord; updatedAt: Date }>();
  let skippedBookIdOnly = 0;
  let skippedInvalid = 0;

  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      skippedInvalid++;
      continue;
    }

    const [key, record] = entry as [string, LegacyRecord];
    if (!record?.userId || !record?.bookId) {
      skippedInvalid++;
      continue;
    }

    if (key !== `${record.userId}:${record.bookId}`) {
      skippedBookIdOnly++;
      continue;
    }

    const updatedAt = toDate(record.updatedAt) ?? new Date(0);
    const current = latest.get(key);
    if (!current || updatedAt > current.updatedAt) {
      latest.set(key, { record, updatedAt });
    }
  }

  return { records: [...latest.values()].map((item) => item.record), skippedBookIdOnly, skippedInvalid };
}

async function run() {
  console.log(`Reading ${filePath}`);
  const { records, skippedBookIdOnly, skippedInvalid } = loadLatestRecords();

  const userIds = [...new Set(records.map((r) => r.userId as string))];
  const bookIds = [...new Set(records.map((r) => r.bookId as string))];

  const [users, books] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
    prisma.book.findMany({ where: { id: { in: bookIds } }, select: { id: true } }),
  ]);
  const existingUsers = new Set(users.map((u) => u.id));
  const existingBooks = new Set(books.map((b) => b.id));

  const writes = [];
  let skippedOrphan = 0;

  for (const record of records) {
    const userId = record.userId as string;
    const bookId = record.bookId as string;

    if (!existingUsers.has(userId) || !existingBooks.has(bookId)) {
      skippedOrphan++;
      continue;
    }

    const data = {
      spineIndex: toInt(record.spineIndex) ?? 0,
      sectionHref: String(record.sectionHref ?? ""),
      locator: String(record.locator ?? ""),
      progressPercent: Math.min(100, Math.max(0, Number(record.progressPercent) || 0)),
      currentPage: toInt(record.currentPage),
      totalPages: toInt(record.totalPages),
      title: record.title || null,
      coverUrl: record.coverUrl || null,
      chapterTitle: record.chapterTitle || null,
      completed: record.completed === true,
      completedAt: toDate(record.completedAt) ?? null,
      updatedAt: toDate(record.updatedAt) ?? new Date(),
    };

    writes.push(
      prisma.bookProgress.upsert({
        where: { userId_bookId: { userId, bookId } },
        create: { userId, bookId, ...data },
        update: data,
      })
    );
  }

  console.log(
    `Entries: ${records.length} unique | skipped bookId-only: ${skippedBookIdOnly} | ` +
      `skipped invalid: ${skippedInvalid} | skipped orphan (missing user/book): ${skippedOrphan}`
  );

  if (dryRun) {
    console.log(`Dry run: would upsert ${writes.length} rows. Nothing written.`);
    return;
  }

  await prisma.$transaction(writes);
  console.log(`Upserted ${writes.length} rows into BookProgress.`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
