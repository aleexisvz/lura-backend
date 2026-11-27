import "dotenv/config";
import { CloudStorageService } from "../src/infrastructure/storage/CloudStorageService.js";
import { backfillCacheControl } from "../src/infrastructure/storage/cache-control-backfill.js";

/**
 * Sets the Cache-Control header on the manga pages and covers that were uploaded before uploads sent it
 * (see src/infrastructure/storage/cache-control.ts for the values).
 *
 * Usage:
 *   pnpm run images:cache-control                  dry run, reads the headers and reports, writes nothing
 *   pnpm run images:cache-control --apply          sets the header on every object that lacks it
 *   pnpm run images:cache-control --prefix <key>   only keys under this prefix, for example manga/<id>/
 *   pnpm run images:cache-control --limit <n>      only the first n keys
 *
 * Each object is copied onto itself with the new header: the URL, the content, the content type and the
 * metadata stay the same. Running it again skips what already has the header.
 */
function readFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const prefix = readFlagValue(args, "--prefix");
  const limitRaw = readFlagValue(args, "--limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (limitRaw && (!Number.isInteger(limit) || (limit as number) < 1)) {
    throw new Error(`--limit must be a positive integer, got "${limitRaw}"`);
  }

  const storage = new CloudStorageService();
  const prefixes = prefix ? [prefix] : ["manga/", "books/"];

  let keys: string[] = [];
  for (const current of prefixes) {
    keys = keys.concat(await storage.listAllKeys(current));
  }
  if (limit) keys = keys.slice(0, limit);

  console.log(`\n${apply ? "APPLY" : "DRY RUN"}: checking ${keys.length} object(s).\n`);

  const summary = await backfillCacheControl(keys, storage, {
    apply,
    onProgress: (done, total) => {
      if (done % 500 === 0 || done === total) console.log(`  ${done}/${total}`);
    },
  });

  console.log("\n--- Result ---");
  console.table({
    "Objects checked": summary.scanned,
    "No policy (skipped)": summary.noPolicy,
    "Already set": summary.alreadySet,
    [apply ? "Updated" : "Would be updated"]: summary.updated,
    Failed: summary.failed,
  });

  for (const failure of summary.failures.slice(0, 20)) {
    console.error(`  failed ${failure.key}: ${failure.message}`);
  }

  if (!apply && summary.updated > 0) {
    console.log("\nNothing was written. To apply, run it again with --apply.");
  }
  if (apply && summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
