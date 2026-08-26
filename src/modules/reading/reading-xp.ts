import { env } from "../../config/env.js";

const XP_BASE_TO_NEXT_LEVEL = 20;
const XP_INCREMENT_PER_LEVEL = 15;

export type ReadingLevelSnapshot = {
  readingLevel: number;
  readingXpTotal: number;
  xpInLevel: number;
  xpToNextLevel: number;
  xpProgressPercent: number;
};

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

export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

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

export function calculateSessionXp(
  durationSeconds: number,
  options?: { at?: Date; multiplier?: number }
) {
  const safeDuration = Number.isFinite(durationSeconds)
    ? Math.max(0, Math.floor(durationSeconds))
    : 0;

  const effectiveSeconds = Math.min(safeDuration, env.READING_XP_SESSION_CAP_SECONDS);
  const minutes = Math.floor(effectiveSeconds / 60);

  const multiplier =
    options?.multiplier !== undefined
      ? options.multiplier
      : getXpMultiplierInfo(options?.at ?? new Date()).multiplier;

  return minutes * env.READING_XP_PER_MINUTE * multiplier;
}

export function buildReadingLevelSnapshot(readingXpTotal: number): ReadingLevelSnapshot {
  const safeXpTotal = Number.isFinite(readingXpTotal)
    ? Math.max(0, Math.floor(readingXpTotal))
    : 0;

  let readingLevel = 1;
  let xpInLevel = safeXpTotal;
  let xpToNextLevel = getXpToNextLevel(readingLevel);

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
