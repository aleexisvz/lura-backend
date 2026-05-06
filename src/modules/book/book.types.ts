export type CreateBookDTO = {
  title: string;
  author?: string;
  description?: string;
};

export type PublicBookDTO = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  hasEpub: boolean;
};
