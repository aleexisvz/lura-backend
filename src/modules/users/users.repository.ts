import { prisma } from "../../infrastructure/database/prisma.js";

export class UsersRepository {
  findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        profileImagePath: true,
        readingXpTotal: true,
      },
    });
  }

  findUserByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
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
        username: true,
        role: true,
        createdAt: true,
        profileImagePath: true,
        readingXpTotal: true,
      },
    });
  }

  updateUsername(userId: string, username: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { username },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        profileImagePath: true,
        readingXpTotal: true,
      },
    });
  }
}
