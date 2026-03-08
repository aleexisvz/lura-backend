import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export class LocalStorageService {

  async ensureDir(dir: string) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  async saveStream(stream: NodeJS.ReadableStream, filepath: string) {
    await pipeline(stream, fs.createWriteStream(filepath));
  }

  async moveDir(src: string, dest: string) {
    await fs.promises.rename(src, dest);
  }

  async listFiles(dir: string) {
    return fs.promises.readdir(dir);
  }

  async exists(filepath: string) {
    try {
      await fs.promises.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  createReadStream(filepath: string) {
    return fs.createReadStream(filepath);
  }

  resolveMangaPagePath(mangaId: string, volumeId: string, filename: string) {
    return path.join(
      process.cwd(),
      "storage",
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "pages",
      filename
    );
  }

}