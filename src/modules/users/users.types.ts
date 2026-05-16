import type { Role } from "@prisma/client";

export type PublicUserDTO = {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt: Date;
  profileImageUrl: string | null;
};
