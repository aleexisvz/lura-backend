import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "../src/infrastructure/database/prisma.js";

const STORAGE_ROOT = path.join(process.cwd(), "storage");

async function convertCover(srcAbsolute: string, destAbsolute: string): Promise<void> {
  await sharp(srcAbsolute)
    .resize({ width: 2048, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(destAbsolute);
}

async function backfillMangaCovers() {
  const mangas = await prisma.manga.findMany({
    where: {
      coverPath: { not: null },
      NOT: { coverPath: { endsWith: ".webp" } },
    },
    select: { id: true, coverPath: true },
  });

  console.log(`Found ${mangas.length} manga covers to convert.`);
  let converted = 0;
  let failed = 0;

  for (const manga of mangas) {
    const src = path.join(STORAGE_ROOT, manga.coverPath!);
    const newRelative = path.posix.join("manga", manga.id, "cover", "cover.webp");
    const dest = path.join(STORAGE_ROOT, newRelative);

    try {
      await convertCover(src, dest);
      await prisma.manga.update({
        where: { id: manga.id },
        data: { coverPath: newRelative },
      });
      await fs.unlink(src);
      converted += 1;
    } catch (err) {
      console.error(`Failed manga cover id=${manga.id}:`, err);
      failed += 1;
    }
  }

  return { scanned: mangas.length, converted, failed };
}

async function backfillVolumeCovers() {
  const volumes = await prisma.volume.findMany({
    where: {
      coverPath: { not: null },
      NOT: { coverPath: { endsWith: ".webp" } },
    },
    select: { id: true, mangaId: true, coverPath: true },
  });

  console.log(`Found ${volumes.length} volume covers to convert.`);
  let converted = 0;
  let failed = 0;

  for (const volume of volumes) {
    const src = path.join(STORAGE_ROOT, volume.coverPath!);
    const newRelative = path.posix.join(
      "manga",
      volume.mangaId,
      "volumes",
      volume.id,
      "cover",
      "cover.webp"
    );
    const dest = path.join(STORAGE_ROOT, newRelative);

    try {
      await convertCover(src, dest);
      await prisma.volume.update({
        where: { id: volume.id },
        data: { coverPath: newRelative },
      });
      await fs.unlink(src);
      converted += 1;
    } catch (err) {
      console.error(`Failed volume cover id=${volume.id}:`, err);
      failed += 1;
    }
  }

  return { scanned: volumes.length, converted, failed };
}

async function runBackfill() {
  const mangaResult = await backfillMangaCovers();
  const volumeResult = await backfillVolumeCovers();

  console.log(
    JSON.stringify(
      {
        ok: true,
        manga: mangaResult,
        volumes: volumeResult,
      },
      null,
      2
    )
  );
}

runBackfill()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
