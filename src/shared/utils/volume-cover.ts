import sharp from "sharp";

// Volume cards show covers at roughly 150 to 220 CSS pixels. 450px keeps them sharp on 2x screens and
// most 3x phones, while decoding in about a fifth of the memory of a full 1000px manga page.
export const VOLUME_COVER_WIDTH = 450;

/** Converts an image to a WebP volume cover no wider than VOLUME_COVER_WIDTH (never enlarges it). */
export function toVolumeCoverThumbnail(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .resize({ width: VOLUME_COVER_WIDTH, withoutEnlargement: true })
    .webp({ quality: 75, effort: 4 })
    .toBuffer();
}

export type VolumeCoverResizeResult = {
  /** Width of the image that was inspected. */
  originalWidth: number;
  /** True when the image was wider than VOLUME_COVER_WIDTH and a thumbnail was produced. */
  resized: boolean;
  /** The thumbnail when `resized` is true, otherwise the untouched input. */
  buffer: Buffer;
};

/** Used by the backfill: only images wider than the thumbnail width are re-encoded, so running it twice is a no-op. */
export async function resizeVolumeCoverIfNeeded(source: Buffer): Promise<VolumeCoverResizeResult> {
  const { width = 0 } = await sharp(source).metadata();
  if (width <= VOLUME_COVER_WIDTH) {
    return { originalWidth: width, resized: false, buffer: source };
  }
  return { originalWidth: width, resized: true, buffer: await toVolumeCoverThumbnail(source) };
}
