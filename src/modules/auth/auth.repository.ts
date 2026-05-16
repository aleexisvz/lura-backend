import { prisma } from "../../infrastructure/database/prisma.js";

export class AuthRepository {
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  }

  async createUser(email: string, username: string, passwordHash: string) {
    return prisma.user.create({
      data: { email, username, password: passwordHash },
      select: { id: true, email: true, username: true, role: true },
    });
  }

  async getUserPublicById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true },
    });
  }

  async promoteUserToAdmin(email: string) {
    return prisma.user.update({
      where: { email },
      data: { role: "ADMIN" },
      select: { id: true, email: true, role: true },
    });
  }
}
