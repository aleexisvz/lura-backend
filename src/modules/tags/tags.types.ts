import type { TagScope } from "@prisma/client";

export type CreateTagDTO = {
  scope: TagScope;
  name: string;
};

export type PublicTagDTO = {
  id: string;
  scope: TagScope;
  name: string;
  slug: string;
};
