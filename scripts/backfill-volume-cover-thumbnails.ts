import "dotenv/config";
import { prisma } from "../src/infrastructure/database/prisma.js";
import { CloudStorageService } from "../src/infrastructure/storage/CloudStorageService.js";
import { backfillVolumeCoverThumbnails } from "../src/modules/manga/volume-cover-backfill.js";
import { VOLUME_COVER_WIDTH } from "../src/shared/utils/volume-cover.js";

/**
 * Replaces oversized volume covers in R2 by thumbnails (see VOLUME_COVER_WIDTH).
 *
 * Usage:
 *   pnpm run images:volume-covers:thumbnails                 dry run, reads and reports, writes nothing
 *   pnpm run images:volume-covers:thumbnails --apply         writes the thumbnails to R2
 *   pnpm run images:volume-covers:thumbnails --manga <id>    only one manga
 *   pnpm run images:volume-covers:thumbnails --limit <n>     only the first n volumes
 *
 * The thumbnail is written to the same storage key, so the database is not changed and running it
 * again is a no-op. The full-size image is not lost: it is still page 001 of the volume.
 */
function readFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const mangaId = readFlagValue(args, "--manga");
  const limitRaw = readFlagValue(args, "--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isInteger(limit) || (limit as number) < 1)) {
    throw new Error(`--limit must be a positive integer, got "${limitRaw}"`);
  }

  const rows = await prisma.volume.findMany({
    where: { coverPath: { not: null }, ...(mangaId ? { mangaId } : {}) },
    select: { id: true, mangaId: true, number: true, coverPath: true },
    orderBy: [{ mangaId: "asc" }, { number: "asc" }],
    ...(limit ? { take: limit } : {}),
  });
  const volumes = rows.map((row) => ({ ...row, coverPath: row.coverPath as string }));

  console.log(
    `\n${apply ? "APPLY" : "DRY RUN"}: checking ${volumes.length} volume cover(s), target width ${VOLUME_COVER_WIDTH}px.\n`
  );

  const storage = new CloudStorageService();
  const summary = await backfillVolumeCoverThumbnails(volumes, storage, {
    apply,
    onProgress: (done, total) => {
      if (done % 15 === 0 || done === total) console.log(`  ${done}/${total}`);
    },
  });

  console.log("\n--- Result ---");
  console.table({
    "Covers checked": summary.scanned,
    "Already small (skipped)": summary.alreadySmall,
    [apply ? "Replaced by thumbnail" : "Would be replaced"]: summary.resized,
    "Missing in storage": summary.missing,
    Failed: summary.failed,
    "Size before (replaced ones)": formatMB(summary.bytesBefore),
    "Size after (replaced ones)": formatMB(summary.bytesAfter),
  });

  for (const failure of summary.failures) {
    console.error(`  failed volume ${failure.volumeId}: ${failure.message}`);
  }

  if (!apply && summary.resized > 0) {
    console.log("\nNothing was written. To apply, run it again with --apply.");
  }
  if (apply && summary.resized > 0) {
    console.log(
      "\nThe URLs did not change, so browsers and the CDN may keep showing the old image until their cache expires."
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
