export type CreateBookDTO = {
  title: string;
  author?: string;
  description?: string;
  categories?: string[];
};

export type UpdateBookDTO = {
  title?: string;
  author?: string;
  description?: string;
  categories?: string[];
};

export type PublicBookDTO = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  categories: string[];
  coverUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  hasEpub: boolean;
};
