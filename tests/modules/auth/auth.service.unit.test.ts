import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../../../src/modules/auth/auth.service.js";

describe("AuthService (unit)", () => {
  const repo = {
    findUserByEmail: vi.fn(),
    findUserByUsername: vi.fn(),
    createUser: vi.fn(),
  };

  const sign = vi.fn();
  const app = {
    jwt: {
      sign,
    },
  } as unknown as FastifyInstance;

  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(repo as any, app);
  });

  it("register() should create user with normalized email and hashed password", async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.findUserByUsername.mockResolvedValue(null);
    repo.createUser.mockResolvedValue({
      id: "user-1",
      email: "user@test.dev",
      username: "user_test",
      role: "USER",
    });
    sign.mockReturnValue("jwt-register-token");

    const result = await service.register({
      email: "  USER@Test.Dev ",
      username: "  User_Test ",
      password: "secret123",
    });

    expect(repo.findUserByEmail).toHaveBeenCalledWith("user@test.dev");
    expect(repo.findUserByUsername).toHaveBeenCalledWith("user_test");
    expect(repo.createUser).toHaveBeenCalledTimes(1);

    const [email, username, hash] = repo.createUser.mock.calls[0] as [string, string, string];
    expect(email).toBe("user@test.dev");
    expect(username).toBe("user_test");
    expect(hash).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", hash)).toBe(true);

    expect(sign).toHaveBeenCalledWith(
      { email: "user@test.dev", role: "USER" },
      { sub: "user-1" }
    );

    expect(result.token).toBe("jwt-register-token");
    expect(result.user).toEqual(
      expect.objectContaining({
        id: "user-1",
        email: "user@test.dev",
        username: "user_test",
        role: "USER",
      })
    );
  });

  it("register() should fail when email already exists", async () => {
    repo.findUserByEmail.mockResolvedValue({ id: "existing-user" });

    await expect(
      service.register({ email: "user@test.dev", username: "user_test", password: "secret123" })
    ).rejects.toMatchObject({
      code: "EMAIL_ALREADY_IN_USE",
      statusCode: 409,
    });

    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it("register() should fail when username already exists", async () => {
    repo.findUserByEmail.mockResolvedValue(null);
    repo.findUserByUsername.mockResolvedValue({ id: "existing-user" });

    await expect(
      service.register({ email: "user@test.dev", username: "user_test", password: "secret123" })
    ).rejects.toMatchObject({
      code: "USERNAME_ALREADY_IN_USE",
      statusCode: 409,
    });
  });

  it("login() should return token and public user data", async () => {
    repo.findUserByEmail.mockResolvedValue({
      id: "admin-1",
      email: "admin@test.dev",
      username: "admin_test",
      password: await bcrypt.hash("secret123", 10),
      role: "ADMIN",
    });
    sign.mockReturnValue("jwt-login-token");

    const result = await service.login({
      email: "  ADMIN@Test.Dev  ",
      password: "secret123",
    });

    expect(repo.findUserByEmail).toHaveBeenCalledWith("admin@test.dev");
    expect(sign).toHaveBeenCalledWith(
      { email: "admin@test.dev", role: "ADMIN" },
      { sub: "admin-1" }
    );

    expect(result).toEqual({
      token: "jwt-login-token",
      user: {
        id: "admin-1",
        email: "admin@test.dev",
        username: "admin_test",
        role: "ADMIN",
      },
    });
  });

  it("login() should fail when user does not exist", async () => {
    repo.findUserByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: "user@test.dev", password: "secret123" })
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("login() should fail when password is invalid", async () => {
    repo.findUserByEmail.mockResolvedValue({
      id: "user-1",
      email: "user@test.dev",
      username: "user_test",
      password: await bcrypt.hash("another-password", 10),
      role: "USER",
    });

    await expect(
      service.login({ email: "user@test.dev", password: "secret123" })
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });
});
