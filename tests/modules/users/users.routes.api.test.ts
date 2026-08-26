import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../../src/app.js";
import { buildAuthHeader } from "../../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../../helpers/db.js";

describe("Users routes (api)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it("GET /users/me should require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/users/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("GET /users/me should return authenticated user data", async () => {
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "user_test",
        password: "hash",
        role: "USER",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: "user-test-id",
        email: "user@tests.local",
        username: "user_test",
        role: "USER",
        createdAt: expect.any(String),
        profileImageUrl: null,
        readingXpTotal: 0,
        readingLevel: 1,
      })
    );
  });

  it("POST /users/me/upload-profile-image should return 400 when file is missing", async () => {
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "user_test",
        password: "hash",
        role: "USER",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/users/me/upload-profile-image",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "NO_FILES_UPLOADED",
      })
    );
  });

  it("GET /users/me/profile-image should return 404 when image is missing", async () => {
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "user_test",
        password: "hash",
        role: "USER",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/users/me/profile-image",
      headers: buildAuthHeader(app, "USER"),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "USER_PROFILE_IMAGE_NOT_FOUND",
      })
    );
  });

  it("PATCH /users/me should require auth", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/users/me",
      payload: { username: "new_name" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("PATCH /users/me should update username with Kanji characters", async () => {
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "old_user",
        password: "hash",
        role: "USER",
      },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: buildAuthHeader(app, "USER"),
      payload: { username: "夜神月_Tanaka" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: "user-test-id",
        username: "夜神月_Tanaka",
      })
    );

    const updatedUser = await prisma.user.findUnique({
      where: { id: "user-test-id" },
    });
    expect(updatedUser?.username).toBe("夜神月_Tanaka");
  });

  it("PATCH /users/me should return 409 when username is taken by another user", async () => {
    await prisma.user.create({
      data: {
        id: "other-user-id",
        email: "other@tests.local",
        username: "taken_user",
        password: "hash",
        role: "USER",
      },
    });
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "my_user",
        password: "hash",
        role: "USER",
      },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: buildAuthHeader(app, "USER"),
      payload: { username: "taken_user" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "USERNAME_ALREADY_IN_USE",
    });
  });

  it("PATCH /users/me should succeed when user submits their own current username", async () => {
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "current_user",
        password: "hash",
        role: "USER",
      },
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: buildAuthHeader(app, "USER"),
      payload: { username: "current_user" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: "user-test-id",
        username: "current_user",
      })
    );
  });

  it("PATCH /users/me should return 400 for invalid characters or length", async () => {
    await prisma.user.create({
      data: {
        id: "user-test-id",
        email: "user@tests.local",
        username: "current_user",
        password: "hash",
        role: "USER",
      },
    });

    const shortResponse = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: buildAuthHeader(app, "USER"),
      payload: { username: "a" },
    });
    expect(shortResponse.statusCode).toBe(400);

    const invalidCharResponse = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers: buildAuthHeader(app, "USER"),
      payload: { username: "user with spaces" },
    });
    expect(invalidCharResponse.statusCode).toBe(400);
  });
});
