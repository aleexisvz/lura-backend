import { prisma } from "../../infrastructure/database/prisma.js";

export class AuthRepository {
  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async createUser(email: string, passwordHash: string) {
    return prisma.user.create({
      data: { email, password: passwordHash },
      select: { id: true, email: true },
    });
  }

  async getUserPublicById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
  }
}