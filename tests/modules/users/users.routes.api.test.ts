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
});
