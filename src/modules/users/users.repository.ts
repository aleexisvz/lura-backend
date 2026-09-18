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

  findPublicProfileByUsername(username: string) {
    return prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        profileImagePath: true,
        readingXpTotal: true,
      },
    });
  }

  searchUsers(query: string, limit = 10) {
    return prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        username: true,
        profileImagePath: true,
        readingXpTotal: true,
      },
      take: limit,
      orderBy: {
        readingXpTotal: "desc",
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

  findTopRankings(limit = 10) {
    return prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        profileImagePath: true,
        readingXpTotal: true,
        readingTimeTotalSeconds: true,
      },
      take: limit,
      orderBy: [
        { readingXpTotal: "desc" },
        { readingTimeTotalSeconds: "desc" },
        { createdAt: "asc" },
      ],
    });
  }
}
