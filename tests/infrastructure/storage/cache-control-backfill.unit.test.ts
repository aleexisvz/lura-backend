import { describe, expect, it, vi } from "vitest";
import {
  COVER_CACHE_CONTROL,
  PAGE_CACHE_CONTROL,
} from "../../../src/infrastructure/storage/cache-control.js";
import { backfillCacheControl } from "../../../src/infrastructure/storage/cache-control-backfill.js";

describe("backfillCacheControl", () => {
  function storage(current: Record<string, string | undefined>) {
    return {
      getCacheControl: vi.fn(async (key: string) => {
        if (key === "manga/m1/volumes/v1/pages/boom.webp") throw new Error("head failed");
        return current[key];
      }),
      setCacheControl: vi.fn(async (_key: string, _value: string): Promise<void> => undefined),
    };
  }

  const keys = [
    "manga/m1/volumes/v1/pages/001.webp", // no header yet
    "manga/m1/volumes/v1/pages/002.webp", // already set
    "manga/m1/cover/cover.webp", // wrong value
    "books/b1/book.epub", // no policy
    "manga/m1/volumes/v1/pages/boom.webp", // fails
  ];
  const current = {
    "manga/m1/volumes/v1/pages/002.webp": PAGE_CACHE_CONTROL,
    "manga/m1/cover/cover.webp": "no-cache",
  };

  it("in a dry run counts what would change and writes nothing", async () => {
    const fake = storage(current);

    const summary = await backfillCacheControl(keys, fake, { apply: false });

    expect(summary).toMatchObject({ scanned: 5, noPolicy: 1, alreadySet: 1, updated: 2, failed: 1 });
    expect(fake.setCacheControl).not.toHaveBeenCalled();
  });

  it("with apply sets the expected value on the objects that need it", async () => {
    const fake = storage(current);

    const summary = await backfillCacheControl(keys, fake, { apply: true });

    expect(summary.updated).toBe(2);
    expect(fake.setCacheControl).toHaveBeenCalledTimes(2);
    expect(fake.setCacheControl).toHaveBeenCalledWith("manga/m1/volumes/v1/pages/001.webp", PAGE_CACHE_CONTROL);
    expect(fake.setCacheControl).toHaveBeenCalledWith("manga/m1/cover/cover.webp", COVER_CACHE_CONTROL);
    expect(summary.failures).toEqual([{ key: "manga/m1/volumes/v1/pages/boom.webp", message: "head failed" }]);
  });
});
