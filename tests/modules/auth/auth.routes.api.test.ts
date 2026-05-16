import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../../src/app.js";
import { resetTestDatabase, disconnectTestDatabase } from "../../helpers/db.js";

describe("Auth routes (api)", () => {
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

  it("POST /auth/register should register user", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "user@test.dev",
        username: "user_test",
        password: "secret123",
      },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toEqual(
      expect.objectContaining({
        email: "user@test.dev",
        username: "user_test",
        role: "USER",
        id: expect.any(String),
      })
    );
  });

  it("POST /auth/register should validate invalid params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "not-an-email",
        username: "ab",
        password: "123",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "INVALID_PARAMS",
        message: "Invalid params",
      })
    );
  });

  it("POST /auth/login should login registered user", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "login@test.dev",
        username: "login_user",
        password: "secret123",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "login@test.dev",
        password: "secret123",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      token: expect.any(String),
      user: {
        id: expect.any(String),
        email: "login@test.dev",
        username: "login_user",
        role: "USER",
      },
    });
  });

  it("POST /auth/login should reject invalid credentials", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "login@test.dev",
        username: "login_user",
        password: "secret123",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "login@test.dev",
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      })
    );
  });

  it("POST /auth/login should validate invalid params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "missing-email-format",
        password: "123",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        code: "INVALID_PARAMS",
      })
    );
  });
});
