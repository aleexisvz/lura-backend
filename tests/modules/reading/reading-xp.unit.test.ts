import { describe, expect, it } from "vitest";
import {
  buildReadingLevelSnapshot,
  calculateSessionXp,
  getXpToNextLevel,
} from "../../../src/modules/reading/reading-xp.js";

describe("reading-xp (unit)", () => {
  it("calculateSessionXp() should return 0 below one minute", () => {
    expect(calculateSessionXp(0)).toBe(0);
    expect(calculateSessionXp(59)).toBe(0);
  });

  it("calculateSessionXp() should award one XP at 60 seconds", () => {
    expect(calculateSessionXp(60)).toBe(1);
  });

  it("calculateSessionXp() should floor partial minutes", () => {
    expect(calculateSessionXp(1799)).toBe(29);
  });

  it("calculateSessionXp() should cap effective time at 30 minutes", () => {
    expect(calculateSessionXp(1800)).toBe(30);
    expect(calculateSessionXp(999999)).toBe(30);
  });

  it("getXpToNextLevel() should grow linearly", () => {
    expect(getXpToNextLevel(1)).toBe(20);
    expect(getXpToNextLevel(2)).toBe(30);
    expect(getXpToNextLevel(5)).toBe(60);
  });

  it("buildReadingLevelSnapshot() should derive level progression from total XP", () => {
    expect(buildReadingLevelSnapshot(0)).toMatchObject({
      readingLevel: 1,
      readingXpTotal: 0,
      xpInLevel: 0,
      xpToNextLevel: 20,
      xpProgressPercent: 0,
    });

    expect(buildReadingLevelSnapshot(50)).toMatchObject({
      readingLevel: 3,
      readingXpTotal: 50,
      xpInLevel: 0,
      xpToNextLevel: 40,
      xpProgressPercent: 0,
    });

    expect(buildReadingLevelSnapshot(95)).toMatchObject({
      readingLevel: 4,
      readingXpTotal: 95,
      xpInLevel: 5,
      xpToNextLevel: 50,
      xpProgressPercent: 10,
    });
  });
});
