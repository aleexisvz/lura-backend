import { Readable } from "node:stream";
import type { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { resizeVolumeCoverIfNeeded } from "../../shared/utils/volume-cover.js";

export type VolumeCoverRef = {
  id: string;
  mangaId: string;
  number: number;
  /** Storage key of the cover, for example manga/{mangaId}/volumes/{volumeId}/cover/cover.webp */
  coverPath: string;
};

export type VolumeCoverBackfillSummary = {
  scanned: number;
  /** Covers already at or below the thumbnail width; left untouched. */
  alreadySmall: number;
  /** Covers that were (apply) or would be (dry run) replaced by a thumbnail. */
  resized: number;
  /** Covers whose object does not exist in storage. */
  missing: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
  failures: Array<{ volumeId: string; message: string }>;
};

type CoverStorage = Pick<CloudStorageService, "getFileBuffer" | "saveStream">;

const CONCURRENCY = 3;

/**
 * Replaces oversized volume covers by thumbnails, writing them back to the same storage key so no
 * database change is needed. Without `apply` it only reads and reports, and never writes.
 */
export async function backfillVolumeCoverThumbnails(
  volumes: VolumeCoverRef[],
  storage: CoverStorage,
  options: { apply: boolean; onProgress?: (done: number, total: number) => void }
): Promise<VolumeCoverBackfillSummary> {
  const summary: VolumeCoverBackfillSummary = {
    scanned: 0,
    alreadySmall: 0,
    resized: 0,
    missing: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    failures: [],
  };

  async function processOne(volume: VolumeCoverRef) {
    summary.scanned += 1;
    try {
      const original = await storage.getFileBuffer(volume.coverPath);
      const result = await resizeVolumeCoverIfNeeded(original);

      if (!result.resized) {
        summary.alreadySmall += 1;
        return;
      }

      if (options.apply) {
        await storage.saveStream(Readable.from(result.buffer), volume.coverPath, "image/webp");
      }
      summary.resized += 1;
      summary.bytesBefore += original.length;
      summary.bytesAfter += result.buffer.length;
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") {
        summary.missing += 1;
        return;
      }
      summary.failed += 1;
      summary.failures.push({
        volumeId: volume.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (let index = 0; index < volumes.length; index += CONCURRENCY) {
    await Promise.all(volumes.slice(index, index + CONCURRENCY).map(processOne));
    options.onProgress?.(Math.min(index + CONCURRENCY, volumes.length), volumes.length);
  }

  return summary;
}
