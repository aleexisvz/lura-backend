/**
 * Cache-Control values sent with the files uploaded to the bucket, so browsers keep the images instead
 * of asking for them again on every visit.
 */

// Manga pages. The public URL gets `?v=<volume.version>` when a volume is replaced, so a page URL never
// changes its content and can be kept for a year.
export const PAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Covers keep the same URL when they are replaced, so they are only kept for a day.
export const COVER_CACHE_CONTROL = "public, max-age=86400";

const PAGE_KEY = /^manga\/[^/]+\/volumes\/[^/]+\/pages\//;
const COVER_KEYS = [
  /^manga\/[^/]+\/cover\//,
  /^manga\/[^/]+\/volumes\/[^/]+\/cover\//,
  /^books\/[^/]+\/cover\//,
];

/**
 * Returns the Cache-Control value for a storage key, or undefined when the key gets none: EPUB files and
 * profile pictures are replaced under the same URL and people expect to see the change at once.
 */
export function cacheControlForKey(key: string): string | undefined {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (PAGE_KEY.test(normalized)) {
    return PAGE_CACHE_CONTROL;
  }
  if (COVER_KEYS.some((pattern) => pattern.test(normalized))) {
    return COVER_CACHE_CONTROL;
  }
  return undefined;
}
