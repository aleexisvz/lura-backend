import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "../src/infrastructure/database/prisma.js";

async function runBackfill() {
  const pages = await prisma.page.findMany({
    where: {
      filename: { not: { endsWith: ".webp" } },
    },
    select: {
      id: true,
      filename: true,
      index: true,
      volumeId: true,
      Volume: {
        select: {
          id: true,
          mangaId: true,
        },
      },
    },
  });

  console.log(`Found ${pages.length} pages to convert.`);

  let converted = 0;
  let failed = 0;

  for (const page of pages) {
    const { mangaId, id: _volumeId } = page.Volume;
    const volumeId = page.volumeId;
    const pagesDir = path.join(
      process.cwd(),
      "storage",
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "pages"
    );
    const src = path.join(pagesDir, page.filename);
    const newFilename = `${path.basename(page.filename, path.extname(page.filename))}.webp`;
    const dest = path.join(pagesDir, newFilename);

    try {
      await sharp(src)
        .resize({ width: 2048, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(dest);

      await prisma.page.update({
        where: { id: page.id },
        data: { filename: newFilename },
      });

      await fs.unlink(src);
      converted += 1;
    } catch (err) {
      console.error(`Failed page id=${page.id} file=${page.filename}:`, err);
      failed += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: pages.length,
        converted,
        failed,
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
