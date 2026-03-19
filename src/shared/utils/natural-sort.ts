/**
 * Sorts an array of items by their `originalFilename` property using
 * natural (human) order rather than lexicographic order.
 *
 * Why this matters for manga pages:
 *   Lexicographic : ["page1", "page10", "page2", "page9"]
 *   Natural       : ["page1", "page2", "page9", "page10"]  ✓
 *
 * `sensitivity: "base"` makes the comparison case- and accent-insensitive.
 */
export function naturalSortByFilename<T extends { originalFilename: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    a.originalFilename.localeCompare(b.originalFilename, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}