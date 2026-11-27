import { describe, expect, it } from "vitest";
import {
  COVER_CACHE_CONTROL,
  PAGE_CACHE_CONTROL,
  cacheControlForKey,
} from "../../../src/infrastructure/storage/cache-control.js";

describe("cacheControlForKey", () => {
  it("keeps manga pages for a year, immutable", () => {
    expect(cacheControlForKey("manga/m1/volumes/v1/pages/001.webp")).toBe(PAGE_CACHE_CONTROL);
    expect(PAGE_CACHE_CONTROL).toContain("immutable");
  });

  it("keeps covers for a day", () => {
    expect(cacheControlForKey("manga/m1/cover/cover.webp")).toBe(COVER_CACHE_CONTROL);
    expect(cacheControlForKey("manga/m1/volumes/v1/cover/cover.webp")).toBe(COVER_CACHE_CONTROL);
    expect(cacheControlForKey("books/b1/cover/cover.jpg")).toBe(COVER_CACHE_CONTROL);
  });

  it("gives nothing to files that are replaced under the same URL and must show the change at once", () => {
    expect(cacheControlForKey("books/b1/book.epub")).toBeUndefined();
    expect(cacheControlForKey("users/u1/profile/avatar.png")).toBeUndefined();
  });

  it("normalizes Windows separators and a leading slash", () => {
    expect(cacheControlForKey("\\manga\\m1\\volumes\\v1\\pages\\001.webp")).toBe(PAGE_CACHE_CONTROL);
  });
});
