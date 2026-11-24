import { Readable } from "node:stream";

export type ImageKind = "jpeg" | "png" | "webp";

export const IMAGE_EXTENSION: Record<ImageKind, string> = { jpeg: ".jpeg", png: ".png", webp: ".webp" };
export const IMAGE_CONTENT_TYPE: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Bytes needed to recognise an EPUB: the ZIP local file header and the start of
// the first entry. 128 leaves room for a long entry name.
export const EPUB_HEAD_BYTES = 128;
// Bytes needed to recognise every supported image format.
export const IMAGE_HEAD_BYTES = 12;

const EPUB_MIMETYPE = "application/epub+zip";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Looks at the first bytes of a file, never at its name or the mimetype the client sent.
export function detectImageKind(head: Buffer): ImageKind | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "jpeg";
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

// An EPUB is a ZIP whose first entry is an uncompressed "mimetype" file that holds
// "application/epub+zip" (EPUB OCF rule). Checks the ZIP local file header of that entry.
export function isEpubHead(head: Buffer): boolean {
  if (head.length < 30 || head.readUInt32LE(0) !== 0x04034b50) {
    return false;
  }

  const compressionMethod = head.readUInt16LE(8);
  const nameLength = head.readUInt16LE(26);
  const extraLength = head.readUInt16LE(28);
  const nameEnd = 30 + nameLength;
  const contentStart = nameEnd + extraLength;
  const contentEnd = contentStart + EPUB_MIMETYPE.length;

  if (head.length < contentEnd) {
    return false;
  }

  return (
    compressionMethod === 0 &&
    head.toString("ascii", 30, nameEnd) === "mimetype" &&
    head.toString("ascii", contentStart, contentEnd) === EPUB_MIMETYPE
  );
}

// Reads the first bytes of a stream and returns them together with a stream that
// still yields the whole content, so the file can be validated before it is saved.
export async function peekStream(source: Readable, length: number) {
  const iterator = source[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let total = 0;

  while (total < length) {
    const next = await iterator.next();
    if (next.done) break;
    const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
    chunks.push(chunk);
    total += chunk.length;
  }

  const head = Buffer.concat(chunks);
  return { head, stream: Readable.from(replay(head, iterator), { objectMode: false }) };
}

async function* replay(head: Buffer, rest: AsyncIterator<unknown>) {
  if (head.length > 0) {
    yield head;
  }
  for (;;) {
    const next = await rest.next();
    if (next.done) return;
    yield next.value;
  }
}
