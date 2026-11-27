import type { CloudStorageService } from "./CloudStorageService.js";
import { cacheControlForKey } from "./cache-control.js";

export type CacheControlBackfillSummary = {
  scanned: number;
  /** Keys that get no Cache-Control by policy (EPUB files, profile pictures). */
  noPolicy: number;
  /** Objects that already carry the expected value. */
  alreadySet: number;
  /** Objects that were (apply) or would be (dry run) updated. */
  updated: number;
  failed: number;
  failures: Array<{ key: string; message: string }>;
};

type CacheStorage = Pick<CloudStorageService, "getCacheControl" | "setCacheControl">;

const CONCURRENCY = 10;

/**
 * Sets the Cache-Control header on objects uploaded before uploads sent it. Without `apply` it only
 * reads the current headers and reports, and never writes. Running it again skips what is already set.
 */
export async function backfillCacheControl(
  keys: string[],
  storage: CacheStorage,
  options: { apply: boolean; onProgress?: (done: number, total: number) => void }
): Promise<CacheControlBackfillSummary> {
  const summary: CacheControlBackfillSummary = {
    scanned: 0,
    noPolicy: 0,
    alreadySet: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };

  async function processOne(key: string) {
    summary.scanned += 1;
    const expected = cacheControlForKey(key);
    if (!expected) {
      summary.noPolicy += 1;
      return;
    }

    try {
      const current = await storage.getCacheControl(key);
      if (current === expected) {
        summary.alreadySet += 1;
        return;
      }
      if (options.apply) {
        await storage.setCacheControl(key, expected);
      }
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failures.push({ key, message: err instanceof Error ? err.message : String(err) });
    }
  }

  for (let index = 0; index < keys.length; index += CONCURRENCY) {
    await Promise.all(keys.slice(index, index + CONCURRENCY).map(processOne));
    options.onProgress?.(Math.min(index + CONCURRENCY, keys.length), keys.length);
  }

  return summary;
}
