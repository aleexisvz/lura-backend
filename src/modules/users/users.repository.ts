import { prisma } from "../../infrastructure/database/prisma.js";

export class UsersRepository {
  findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        profileImagePath: true,
      },
    });
  }

  updateProfileImagePath(userId: string, profileImagePath: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { profileImagePath },
      select: {
        id: true,
        email: true,
        role: true,
        profileImagePath: true,
      },
    });
  }
}

