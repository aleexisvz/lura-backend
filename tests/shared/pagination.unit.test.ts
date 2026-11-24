import { describe, expect, it } from "vitest";
import { AppError } from "../../src/shared/errors/AppError.js";
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  parsePageRequest,
  splitPage,
} from "../../src/shared/http/pagination.js";

const row = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe("pagination helpers (unit)", () => {
  it("round-trips a cursor through encode and decode", () => {
    const original = row("abc", "2026-10-01T10:00:00.000Z");

    expect(decodeCursor(encodeCursor(original))).toEqual(original);
  });

  it("rejects a malformed cursor with 400 INVALID_PARAMS", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(AppError);
    try {
      decodeCursor("not-a-cursor");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_PARAMS", statusCode: 400 });
    }
  });

  it("does not paginate when neither limit nor cursor is sent", () => {
    expect(parsePageRequest({})).toBeNull();
  });

  it("paginates with the default size when only a cursor is sent", () => {
    const cursor = encodeCursor(row("abc", "2026-10-01T10:00:00.000Z"));

    expect(parsePageRequest({ cursor })).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      cursor: { createdAt: new Date("2026-10-01T10:00:00.000Z"), id: "abc" },
    });
  });

  it("rejects a limit outside 1 to 100", () => {
    expect(() => parsePageRequest({ limit: "0" })).toThrow();
    expect(() => parsePageRequest({ limit: "101" })).toThrow();
  });

  it("returns the next cursor only when another page exists", () => {
    const rows = [row("a", "2026-10-03T00:00:00Z"), row("b", "2026-10-02T00:00:00Z"), row("c", "2026-10-01T00:00:00Z")];

    const firstPage = splitPage(rows, 2);
    expect(firstPage.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(firstPage.nextCursor).toBe(encodeCursor(rows[1]!));

    const lastPage = splitPage(rows.slice(2), 2);
    expect(lastPage.items.map((r) => r.id)).toEqual(["c"]);
    expect(lastPage.nextCursor).toBeNull();
  });
});
