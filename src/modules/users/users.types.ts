import type { Role } from "@prisma/client";

export type PublicUserDTO = {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt: Date;
  profileImageUrl: string | null;
  readingXpTotal: number;
  readingLevel: number;
};

export type UserSearchResultDTO = {
  id: string;
  username: string;
  profileImageUrl: string | null;
  readingLevel: number;
  readingXpTotal: number;
};

export type PublicUserProfileDTO = {
  id: string;
  username: string;
  role: Role;
  createdAt: Date;
  profileImageUrl: string | null;
  readingXpTotal: number;
  readingLevel: number;
  stats: {
    totalSessions: number;
    totalMinutes: number;
    totalSeconds: number;
    mangaSeconds: number;
    bookSeconds: number;
    totalPagesRead: number;
    mangaPagesRead: number;
    bookPagesRead: number;
    totalVolumesRead: number;
    totalMangasRead: number;
    totalSeriesRead: number;
    totalBooksRead: number;
    readingLevel: number;
    readingXpTotal: number;
    xpInLevel: number;
    xpToNextLevel: number;
    xpProgressPercent: number;
    activeXpEvent: string | null;
    isHotWeekend: boolean;
    xpMultiplier: number;
    xpPerMinute: number;
  };
  recentSeries: {
    manga: Array<{
      contentId: string;
      title: string;
      coverUrl: string | null;
      lastStartedAt: Date;
    }>;
    books: Array<{
      contentId: string;
      title: string;
      coverUrl: string | null;
      lastStartedAt: Date;
    }>;
  };
  continueReading: unknown[];
};

export type UserRankingDTO = {
  rank: number;
  id: string;
  username: string;
  profileImageUrl: string | null;
  readingLevel: number;
  readingXpTotal: number;
  readingTimeTotalSeconds: number;
  role: "USER" | "ADMIN";
};
