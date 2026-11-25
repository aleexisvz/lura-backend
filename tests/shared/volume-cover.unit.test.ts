import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  VOLUME_COVER_WIDTH,
  resizeVolumeCoverIfNeeded,
  toVolumeCoverThumbnail,
} from "../../src/shared/utils/volume-cover.js";

// A flat colour image of the given size, encoded as WebP like the manga pages.
function webpImage(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 90, b: 160 } },
  })
    .webp()
    .toBuffer();
}

describe("toVolumeCoverThumbnail", () => {
  it("shrinks a full manga page to the cover width as WebP, keeping the aspect ratio", async () => {
    const page = await webpImage(1000, 1400);

    const thumbnail = await toVolumeCoverThumbnail(page);
    const meta = await sharp(thumbnail).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(VOLUME_COVER_WIDTH);
    expect(meta.height).toBe(Math.round((VOLUME_COVER_WIDTH * 1400) / 1000));
  });

  it("does not enlarge an image that is already smaller than the cover width", async () => {
    const small = await webpImage(300, 420);

    const meta = await sharp(await toVolumeCoverThumbnail(small)).metadata();

    expect(meta.width).toBe(300);
    expect(meta.height).toBe(420);
  });

  it("converts other formats to WebP", async () => {
    const png = await sharp({
      create: { width: 800, height: 1100, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const meta = await sharp(await toVolumeCoverThumbnail(png)).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(VOLUME_COVER_WIDTH);
  });
});

describe("resizeVolumeCoverIfNeeded", () => {
  it("resizes a cover wider than the thumbnail width and reports the original width", async () => {
    const page = await webpImage(1000, 1400);

    const result = await resizeVolumeCoverIfNeeded(page);

    expect(result.resized).toBe(true);
    expect(result.originalWidth).toBe(1000);
    expect((await sharp(result.buffer).metadata()).width).toBe(VOLUME_COVER_WIDTH);
  });

  it("leaves a cover at or below the thumbnail width untouched, so a second run changes nothing", async () => {
    const atLimit = await webpImage(VOLUME_COVER_WIDTH, 630);

    const result = await resizeVolumeCoverIfNeeded(atLimit);

    expect(result.resized).toBe(false);
    expect(result.originalWidth).toBe(VOLUME_COVER_WIDTH);
    expect(result.buffer).toBe(atLimit);
  });

  it("is idempotent when applied to its own output", async () => {
    const page = await webpImage(1000, 1400);
    const first = await resizeVolumeCoverIfNeeded(page);

    const second = await resizeVolumeCoverIfNeeded(first.buffer);

    expect(second.resized).toBe(false);
  });
});
