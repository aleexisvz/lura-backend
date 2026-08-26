import { describe, expect, it } from "vitest";
import {
  buildReadingLevelSnapshot,
  calculateSessionXp,
  getXpMultiplierInfo,
  getXpToNextLevel,
  isWeekend,
} from "../../../src/modules/reading/reading-xp.js";

describe("reading-xp (unit)", () => {
  const wednesday = new Date("2026-08-19T14:00:00Z"); // weekday
  const saturday = new Date("2026-08-22T14:00:00Z"); // weekend
  const sunday = new Date("2026-08-23T14:00:00Z"); // weekend

  it("isWeekend() should detect Saturdays and Sundays accurately", () => {
    expect(isWeekend(wednesday)).toBe(false);
    expect(isWeekend(saturday)).toBe(true);
    expect(isWeekend(sunday)).toBe(true);
  });

  it("getXpMultiplierInfo() should return active event and double rate on weekends", () => {
    expect(getXpMultiplierInfo(wednesday)).toEqual({
      multiplier: 1,
      isHotWeekend: false,
      activeXpEvent: null,
      xpPerMinute: 2,
    });

    expect(getXpMultiplierInfo(saturday)).toEqual({
      multiplier: 2,
      isHotWeekend: true,
      activeXpEvent: "Hot Weekend",
      xpPerMinute: 4,
    });
  });

  it("calculateSessionXp() should return 0 below one minute", () => {
    expect(calculateSessionXp(0, { at: wednesday })).toBe(0);
    expect(calculateSessionXp(59, { at: wednesday })).toBe(0);
    expect(calculateSessionXp(59, { at: saturday })).toBe(0);
  });

  it("calculateSessionXp() should award 2 XP per minute on weekdays", () => {
    expect(calculateSessionXp(60, { at: wednesday })).toBe(2);
    expect(calculateSessionXp(120, { at: wednesday })).toBe(4);
    expect(calculateSessionXp(1799, { at: wednesday })).toBe(58);
  });

  it("calculateSessionXp() should award 4 XP per minute on Hot Weekends (2x multiplier)", () => {
    expect(calculateSessionXp(60, { at: saturday })).toBe(4);
    expect(calculateSessionXp(120, { at: sunday })).toBe(8);
    expect(calculateSessionXp(1799, { at: saturday })).toBe(116);
  });

  it("calculateSessionXp() should cap effective time at 30 minutes", () => {
    expect(calculateSessionXp(1800, { at: wednesday })).toBe(60);
    expect(calculateSessionXp(999999, { at: wednesday })).toBe(60);
    expect(calculateSessionXp(1800, { at: saturday })).toBe(120);
    expect(calculateSessionXp(999999, { at: saturday })).toBe(120);
  });

  it("getXpToNextLevel() should grow linearly", () => {
    expect(getXpToNextLevel(1)).toBe(20);
    expect(getXpToNextLevel(2)).toBe(35);
    expect(getXpToNextLevel(5)).toBe(80);
  });

  it("buildReadingLevelSnapshot() should derive level progression from total XP", () => {
    expect(buildReadingLevelSnapshot(0)).toMatchObject({
      readingLevel: 1,
      readingXpTotal: 0,
      xpInLevel: 0,
      xpToNextLevel: 20,
      xpProgressPercent: 0,
    });

    expect(buildReadingLevelSnapshot(55)).toMatchObject({
      readingLevel: 3,
      readingXpTotal: 55,
      xpInLevel: 0,
      xpToNextLevel: 50,
      xpProgressPercent: 0,
    });

    expect(buildReadingLevelSnapshot(95)).toMatchObject({
      readingLevel: 3,
      readingXpTotal: 95,
      xpInLevel: 40,
      xpToNextLevel: 50,
      xpProgressPercent: 80,
    });

    expect(buildReadingLevelSnapshot(110)).toMatchObject({
      readingLevel: 4,
      readingXpTotal: 110,
      xpInLevel: 5,
      xpToNextLevel: 65,
      xpProgressPercent: 7,
    });
  });
});
