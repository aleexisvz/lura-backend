import type { Role } from "@prisma/client";

export type PublicUserDTO = {
  id: string;
  email: string;
  role: Role;
  profileImageUrl: string | null;
};

