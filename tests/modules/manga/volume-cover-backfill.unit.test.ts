import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  backfillVolumeCoverThumbnails,
  type VolumeCoverRef,
} from "../../../src/modules/manga/volume-cover-backfill.js";
import { VOLUME_COVER_WIDTH } from "../../../src/shared/utils/volume-cover.js";

function webpImage(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 90, b: 160 } },
  })
    .webp()
    .toBuffer();
}

function ref(id: string): VolumeCoverRef {
  return { id, mangaId: "m1", number: 1, coverPath: `manga/m1/volumes/${id}/cover/cover.webp` };
}

function readableStorage(objects: Record<string, Buffer>) {
  return {
    getFileBuffer: vi.fn(async (key: string) => {
      const object = objects[key];
      if (!object) throw Object.assign(new Error("not found"), { name: "NoSuchKey" });
      return object;
    }),
    saveStream: vi.fn(
      async (_stream: NodeJS.ReadableStream, _key: string, _contentType?: string): Promise<void> => undefined
    ),
  };
}

describe("backfillVolumeCoverThumbnails", () => {
  it("in a dry run reports what would change and writes nothing", async () => {
    const big = await webpImage(1000, 1400);
    const small = await webpImage(300, 420);
    const storage = readableStorage({ [ref("big").coverPath]: big, [ref("small").coverPath]: small });

    const summary = await backfillVolumeCoverThumbnails([ref("big"), ref("small")], storage, { apply: false });

    expect(summary.scanned).toBe(2);
    expect(summary.resized).toBe(1);
    expect(summary.alreadySmall).toBe(1);
    expect(summary.bytesBefore).toBe(big.length);
    expect(summary.bytesAfter).toBeGreaterThan(0);
    expect(summary.bytesAfter).toBeLessThan(summary.bytesBefore);
    expect(storage.saveStream).not.toHaveBeenCalled();
  });

  it("when applied writes a thumbnail to the same key as WebP and leaves small covers alone", async () => {
    const big = await webpImage(1000, 1400);
    const small = await webpImage(300, 420);
    const storage = readableStorage({ [ref("big").coverPath]: big, [ref("small").coverPath]: small });
    const written: Buffer[] = [];
    storage.saveStream.mockImplementation(async (stream: NodeJS.ReadableStream) => {
      for await (const chunk of stream) written.push(Buffer.from(chunk as Buffer));
    });

    await backfillVolumeCoverThumbnails([ref("big"), ref("small")], storage, { apply: true });

    expect(storage.saveStream).toHaveBeenCalledTimes(1);
    expect(storage.saveStream).toHaveBeenCalledWith(expect.anything(), ref("big").coverPath, "image/webp");
    expect((await sharp(Buffer.concat(written)).metadata()).width).toBe(VOLUME_COVER_WIDTH);
  });

  it("counts a missing object separately and keeps going after a failure", async () => {
    const big = await webpImage(1000, 1400);
    const storage = readableStorage({ [ref("ok").coverPath]: big, [ref("broken").coverPath]: Buffer.from("not an image") });

    const summary = await backfillVolumeCoverThumbnails(
      [ref("gone"), ref("broken"), ref("ok")],
      storage,
      { apply: true }
    );

    expect(summary.missing).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.failures[0]?.volumeId).toBe("broken");
    expect(summary.resized).toBe(1);
    expect(storage.saveStream).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a second run over covers it already shrank", async () => {
    const big = await webpImage(1000, 1400);
    const key = ref("v").coverPath;
    const objects: Record<string, Buffer> = { [key]: big };
    const storage = readableStorage(objects);
    storage.saveStream.mockImplementation(async (stream: NodeJS.ReadableStream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
      objects[key] = Buffer.concat(chunks);
    });

    const first = await backfillVolumeCoverThumbnails([ref("v")], storage, { apply: true });
    const second = await backfillVolumeCoverThumbnails([ref("v")], storage, { apply: true });

    expect(first.resized).toBe(1);
    expect(second.resized).toBe(0);
    expect(second.alreadySmall).toBe(1);
    expect(storage.saveStream).toHaveBeenCalledTimes(1);
  });

  it("reports progress as covers are processed", async () => {
    const storage = readableStorage({});
    const onProgress = vi.fn();

    await backfillVolumeCoverThumbnails([ref("a"), ref("b"), ref("c"), ref("d")], storage, {
      apply: false,
      onProgress,
    });

    expect(onProgress).toHaveBeenLastCalledWith(4, 4);
  });
});
