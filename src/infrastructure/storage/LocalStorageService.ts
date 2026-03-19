import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export class LocalStorageService {

  async ensureDir(dir: string) {
    // recursive: true is a no-op when the directory already exists,
    // so this is safe to call unconditionally.
    await fs.promises.mkdir(dir, { recursive: true });
  }

  async saveStream(stream: NodeJS.ReadableStream, filepath: string) {
    // pipeline handles backpressure automatically and destroys both streams
    // on error, preventing file descriptor leaks.
    await pipeline(stream, fs.createWriteStream(filepath));
  }

  async moveDir(src: string, dest: string) {
    // fs.rename is an atomic OS-level move when src and dest are on the
    // same filesystem (which they always are here: both under /storage).
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
      // access() throws when the path doesn't exist or isn't readable.
      return false;
    }
  }

  createReadStream(filepath: string) {
    return fs.createReadStream(filepath);
  }

  resolveMangaPagePath(mangaId: string, volumeId: string, filename: string) {
    // Canonical layout on disk:
    // storage/manga/<mangaId>/volumes/<volumeId>/pages/<filename>
    // e.g. storage/manga/clx.../volumes/cly.../pages/007.jpeg
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