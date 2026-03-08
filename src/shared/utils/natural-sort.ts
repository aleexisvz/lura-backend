export function naturalSortByFilename<T extends { originalFilename: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    a.originalFilename.localeCompare(b.originalFilename, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
}