import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { AuthRepository } from "../../../src/modules/auth/auth.repository.js";
import {
  disconnectTestDatabase,
  resetTestDatabase,
} from "../../helpers/db.js";

describe("AuthRepository (integration)", () => {
  const repo = new AuthRepository();

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it("createUser() should persist user and return public fields", async () => {
    const created = await repo.createUser("user@test.dev", "user_test", "hash-secret");

    expect(created).toMatchObject({
      email: "user@test.dev",
      username: "user_test",
      role: "USER",
    });

    const persisted = await prisma.user.findUnique({
      where: { email: "user@test.dev" },
    });

    expect(persisted).toBeTruthy();
    expect(persisted?.password).toBe("hash-secret");
  });

  it("findUserByEmail() should return null when user does not exist", async () => {
    const user = await repo.findUserByEmail("missing@test.dev");

    expect(user).toBeNull();
  });

  it("findUserByEmail() should return persisted user", async () => {
    await prisma.user.create({
      data: {
        email: "seed@test.dev",
        username: "seed_user",
        password: "seed-hash",
      },
    });

    const user = await repo.findUserByEmail("seed@test.dev");

    expect(user).toBeTruthy();
    expect(user?.email).toBe("seed@test.dev");
    expect(user?.password).toBe("seed-hash");
  });

  it("getUserPublicById() should return only id/email", async () => {
    const seeded = await prisma.user.create({
      data: {
        email: "public@test.dev",
        username: "public_user",
        password: "seed-hash",
      },
    });

    const user = await repo.getUserPublicById(seeded.id);

    expect(user).toEqual({
      id: seeded.id,
      email: "public@test.dev",
      username: "public_user",
    });
  });
});
