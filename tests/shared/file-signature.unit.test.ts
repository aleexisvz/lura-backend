import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { detectImageKind, isEpubHead, peekStream } from "../../src/shared/utils/file-signature.js";

// Builds the start of a ZIP local file header, as an EPUB writer does for "mimetype".
function zipEntry(options: { name?: string; content?: string; method?: number; extra?: Buffer } = {}) {
  const name = Buffer.from(options.name ?? "mimetype", "ascii");
  const content = Buffer.from(options.content ?? "application/epub+zip", "ascii");
  const extra = options.extra ?? Buffer.alloc(0);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(options.method ?? 0, 8);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, name, extra, content]);
}

describe("file signature helpers (unit)", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(detectImageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("jpeg");
    expect(detectImageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    expect(detectImageKind(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", "latin1"))).toBe("webp");
  });

  it("rejects other content, including a short or empty head", () => {
    expect(detectImageKind(Buffer.from("GIF89a", "ascii"))).toBeNull();
    expect(detectImageKind(Buffer.from("just some text, not an image", "utf8"))).toBeNull();
    expect(detectImageKind(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
  });

  it("accepts an EPUB whose first entry is an uncompressed mimetype file", () => {
    expect(isEpubHead(zipEntry())).toBe(true);
    expect(isEpubHead(zipEntry({ extra: Buffer.alloc(9) }))).toBe(true);
  });

  it("rejects a ZIP that is not an EPUB", () => {
    expect(isEpubHead(zipEntry({ name: "notes.txt" }))).toBe(false);
    expect(isEpubHead(zipEntry({ content: "text/plain" }))).toBe(false);
    expect(isEpubHead(zipEntry({ method: 8 }))).toBe(false);
  });

  it("rejects content that is not a ZIP, and truncated headers", () => {
    expect(isEpubHead(Buffer.from("%PDF-1.7 not a zip at all", "ascii"))).toBe(false);
    expect(isEpubHead(zipEntry().subarray(0, 40))).toBe(false);
  });

  it("peekStream returns the start of the content and still yields all of it", async () => {
    const source = Readable.from([Buffer.from("ab"), Buffer.from("cd"), Buffer.from("ef")]);

    const { head, stream } = await peekStream(source, 3);
    expect(head.subarray(0, 3).toString()).toBe("abc");

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("abcdef");
  });
});
