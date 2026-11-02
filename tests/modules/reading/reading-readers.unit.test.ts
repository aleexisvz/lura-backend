import { describe, expect, it } from "vitest";
import { mergeRecentReaders } from "../../../src/modules/reading/reading-session.service.js";
import type { ReaderEntry } from "../../../src/modules/reading/reading-readers.repository.js";

function entry(userId: string, iso: string): ReaderEntry {
  return {
    userId,
    lastReadAt: new Date(iso),
    user: { id: userId, username: userId, profileImagePath: null, readingXpTotal: 0 },
  };
}

describe("mergeRecentReaders (unit)", () => {
  it("keeps one entry per user at their most recent read, across sessions and progress", () => {
    const sessions = [entry("a", "2026-10-20T00:00:00Z")];
    const progress = [entry("a", "2026-10-10T00:00:00Z"), entry("b", "2026-10-05T00:00:00Z")];

    const merged = mergeRecentReaders(sessions, progress, 10);

    expect(merged.map((r) => r.userId)).toEqual(["a", "b"]);
    expect(merged[0]?.lastReadAt).toEqual(new Date("2026-10-20T00:00:00Z"));
  });

  it("lets a newer progress entry replace an older session entry", () => {
    const sessions = [entry("a", "2026-10-01T00:00:00Z")];
    const progress = [entry("a", "2026-10-15T00:00:00Z")];

    const merged = mergeRecentReaders(sessions, progress, 10);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.lastReadAt).toEqual(new Date("2026-10-15T00:00:00Z"));
  });

  it("sorts readers from most to least recent", () => {
    const sessions = [entry("old", "2026-10-01T00:00:00Z"), entry("new", "2026-10-30T00:00:00Z")];
    const progress = [entry("mid", "2026-10-15T00:00:00Z")];

    const merged = mergeRecentReaders(sessions, progress, 10);

    expect(merged.map((r) => r.userId)).toEqual(["new", "mid", "old"]);
  });

  it("returns at most the requested number of readers", () => {
    const sessions = [
      entry("a", "2026-10-03T00:00:00Z"),
      entry("b", "2026-10-02T00:00:00Z"),
      entry("c", "2026-10-01T00:00:00Z"),
    ];

    const merged = mergeRecentReaders(sessions, [], 2);

    expect(merged.map((r) => r.userId)).toEqual(["a", "b"]);
  });

  it("returns an empty list when there are no readers", () => {
    expect(mergeRecentReaders([], [], 10)).toEqual([]);
  });
});
