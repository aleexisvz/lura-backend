import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/infrastructure/database/prisma.js";
import { buildApp } from "../../src/app.js";
import { buildAuthHeader } from "../helpers/auth.js";
import { disconnectTestDatabase, resetTestDatabase } from "../helpers/db.js";

// Builds a multipart/form-data body with one file field.
function multipartFile(field: string, filename: string, contentType: string, content: Buffer) {
  const boundary = "----lura-upload-test";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("upload content validation (api)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await prisma.user.create({
      data: { id: "user-test-id", email: "user@tests.local", username: "user_test", password: "hashed" },
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it("rejects an avatar whose content is not an image, even when it is named .png", async () => {
    const fake = multipartFile("file", "avatar.png", "image/png", Buffer.from("this is not a picture"));

    const response = await app.inject({
      method: "POST",
      url: "/users/me/upload-profile-image",
      headers: { ...buildAuthHeader(app, "USER"), ...fake.headers },
      payload: fake.body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("rejects a book cover whose content is not an image", async () => {
    const book = await prisma.book.create({ data: { title: "Dune" } });
    const fake = multipartFile("file", "cover.jpg", "image/jpeg", Buffer.from("%PDF-1.7 not a cover"));

    const response = await app.inject({
      method: "POST",
      url: `/books/${book.id}/upload-cover`,
      headers: { ...buildAuthHeader(app, "ADMIN"), ...fake.headers },
      payload: fake.body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_PARAMS" });
  });

  it("rejects an EPUB that is not a ZIP with a mimetype entry, even when named .epub", async () => {
    const book = await prisma.book.create({ data: { title: "Dune" } });
    const fake = multipartFile("file", "dune.epub", "application/epub+zip", Buffer.from("just text in an epub name"));

    const response = await app.inject({
      method: "POST",
      url: `/books/${book.id}/upload-epub`,
      headers: { ...buildAuthHeader(app, "ADMIN"), ...fake.headers },
      payload: fake.body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_PARAMS" });
    const stored = await prisma.book.findUnique({ where: { id: book.id } });
    expect(stored?.epubPath).toBeNull();
  });
});
