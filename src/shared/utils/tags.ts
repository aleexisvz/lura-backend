export function normalizeTagName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function slugifyTag(value: string) {
  return normalizeTagName(value).replace(/\s+/g, "-");
}
