import { z } from "zod";
import { badRequest } from "../errors/error-factory.js";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const NEXT_CURSOR_HEADER = "X-Next-Cursor";

// Keyset position: the last row of the previous page, ordered by createdAt then id.
export type PageCursor = { createdAt: Date; id: string };

// null means no pagination was requested: the caller keeps returning every row.
export type PageRequest = { limit: number; cursor: PageCursor | null } | null;

const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).optional(),
});

export function encodeCursor(row: PageCursor): string {
  const payload = JSON.stringify({ c: row.createdAt.toISOString(), i: row.id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(value: string): PageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      c?: unknown;
      i?: unknown;
    };
    const createdAt = new Date(String(parsed.c));
    if (typeof parsed.i !== "string" || parsed.i.length === 0 || Number.isNaN(createdAt.getTime())) {
      throw new Error("invalid cursor shape");
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw badRequest("INVALID_PARAMS", "Invalid cursor");
  }
}

// Pagination starts when either `limit` or `cursor` is sent. Without both, the
// response keeps its previous shape (every row) so existing clients still work.
export function parsePageRequest(query: unknown): PageRequest {
  const { limit, cursor } = PageQuerySchema.parse(query);
  if (limit === undefined && cursor === undefined) {
    return null;
  }

  return {
    limit: limit ?? DEFAULT_PAGE_SIZE,
    cursor: cursor === undefined ? null : decodeCursor(cursor),
  };
}

// Rows are fetched with one extra item; it only tells whether another page exists.
export function splitPage<T extends PageCursor>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null;
  return { items, nextCursor };
}

// Rows strictly after the cursor in (createdAt desc, id desc) order.
export function keysetAfter(cursor: PageCursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
