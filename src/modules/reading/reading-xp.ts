import { env } from "../../config/env.js";

// Base XP required to graduate from level 1 to level 2.
const XP_BASE_TO_NEXT_LEVEL = 20;
// Additional XP required per subsequent level (arithmetic progression).
const XP_INCREMENT_PER_LEVEL = 15;

export type ReadingLevelSnapshot = {
  readingLevel: number;
  readingXpTotal: number;
  xpInLevel: number;
  xpToNextLevel: number;
  xpProgressPercent: number;
};

/**
 * Calculates the XP requirement to complete the given level tier.
 * Follows an arithmetic progression: Level 1 = 20 XP, Level 2 = 35 XP, Level 3 = 50 XP, etc.
 */
export function getXpToNextLevel(level: number) {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return XP_BASE_TO_NEXT_LEVEL + (safeLevel - 1) * XP_INCREMENT_PER_LEVEL;
}

export type XpMultiplierInfo = {
  multiplier: number;
  isHotWeekend: boolean;
  activeXpEvent: string | null;
  xpPerMinute: number;
};

/**
 * Checks whether a given timestamp falls on a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Resolves the active XP multiplier and promotional event banner.
 * Activates the 2x "Hot Weekend" multiplier on Saturdays and Sundays.
 */
export function getXpMultiplierInfo(date: Date = new Date()): XpMultiplierInfo {
  const hotWeekend = isWeekend(date);
  const multiplier = hotWeekend ? env.READING_XP_WEEKEND_MULTIPLIER : 1;
  const xpPerMinute = env.READING_XP_PER_MINUTE * multiplier;

  return {
    multiplier,
    isHotWeekend: hotWeekend,
    activeXpEvent: hotWeekend ? "Hot Weekend" : null,
    xpPerMinute,
  };
}

/**
 * Calculates XP earned in a reading session based on elapsed reading minutes.
 * Duration is capped at READING_XP_SESSION_CAP_SECONDS to prevent idle abuse.
 */
export function calculateSessionXp(
  durationSeconds: number,
  options?: { at?: Date; multiplier?: number }
) {
  const safeDuration = Number.isFinite(durationSeconds)
    ? Math.max(0, Math.floor(durationSeconds))
    : 0;

  // Cap effective session duration to prevent unbounded XP from idle tabs
  const effectiveSeconds = Math.min(safeDuration, env.READING_XP_SESSION_CAP_SECONDS);
  const minutes = Math.floor(effectiveSeconds / 60);

  const multiplier =
    options?.multiplier !== undefined
      ? options.multiplier
      : getXpMultiplierInfo(options?.at ?? new Date()).multiplier;

  return minutes * env.READING_XP_PER_MINUTE * multiplier;
}

/**
 * Computes the user's current reading level, XP remaining within the level,
 * and percentage progress toward the next tier from their lifetime cumulative XP.
 */
export function buildReadingLevelSnapshot(readingXpTotal: number): ReadingLevelSnapshot {
  const safeXpTotal = Number.isFinite(readingXpTotal)
    ? Math.max(0, Math.floor(readingXpTotal))
    : 0;

  let readingLevel = 1;
  let xpInLevel = safeXpTotal;
  let xpToNextLevel = getXpToNextLevel(readingLevel);

  // Incrementally subtract XP thresholds until reaching the current level bracket
  while (xpInLevel >= xpToNextLevel) {
    xpInLevel -= xpToNextLevel;
    readingLevel += 1;
    xpToNextLevel = getXpToNextLevel(readingLevel);
  }

  const xpProgressPercent = Math.max(
    0,
    Math.min(100, Math.floor((xpInLevel / xpToNextLevel) * 100))
  );

  return {
    readingLevel,
    readingXpTotal: safeXpTotal,
    xpInLevel,
    xpToNextLevel,
    xpProgressPercent,
  };
}
