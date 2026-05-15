export function normalizeCategories(categories: string[] = []) {
  return Array.from(
    new Set(
      categories
        .map((category) => category.trim().toLowerCase())
        .filter((category) => category.length > 0)
    )
  );
}
