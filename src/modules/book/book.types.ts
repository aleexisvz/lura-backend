export type CreateBookDTO = {
  title: string;
  author?: string;
  description?: string;
  tagIds?: string[];
};

export type UpdateBookDTO = {
  title?: string;
  author?: string;
  description?: string;
  tagIds?: string[];
};

export type PublicBookDTO = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: { id: string; name: string; slug: string }[];
  categories: string[];
  coverUrl: string | null;
  epubUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  hasEpub: boolean;
  readerStatus: "READY" | "PROCESSING" | "FAILED";
};

export type BookRankingDTO = {
  rank: number;
  readersCount: number;
  book: PublicBookDTO;
};
