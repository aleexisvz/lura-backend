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

  async getFileStats(filepath: string) {
    return fs.promises.stat(filepath);
  }

  async removeFilesByPrefix(dir: string, prefix: string) {
    const exists = await this.exists(dir);
    if (!exists) {
      return;
    }

    const entries = await fs.promises.readdir(dir);
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => fs.promises.rm(path.join(dir, entry), { force: true }))
    );
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

  resolveBookEpubPath(bookId: string) {
    // Canonical layout on disk:
    // storage/books/<bookId>/book.epub
    return path.join(process.cwd(), "storage", "books", bookId, "book.epub");
  }

  resolveMangaCoverDir(mangaId: string) {
    return path.join(process.cwd(), "storage", "manga", mangaId, "cover");
  }

  resolveMangaCoverPath(mangaId: string, extension: string) {
    return path.join(this.resolveMangaCoverDir(mangaId), `cover${extension}`);
  }

  resolveVolumeCoverDir(mangaId: string, volumeId: string) {
    return path.join(
      process.cwd(),
      "storage",
      "manga",
      mangaId,
      "volumes",
      volumeId,
      "cover"
    );
  }

  resolveVolumeCoverPath(mangaId: string, volumeId: string, extension: string) {
    return path.join(this.resolveVolumeCoverDir(mangaId, volumeId), `cover${extension}`);
  }

  resolveBookCoverDir(bookId: string) {
    return path.join(process.cwd(), "storage", "books", bookId, "cover");
  }

  resolveBookCoverPath(bookId: string, extension: string) {
    return path.join(this.resolveBookCoverDir(bookId), `cover${extension}`);
  }

  resolveUserProfileImageDir(userId: string) {
    return path.join(process.cwd(), "storage", "users", userId, "profile");
  }

  resolveUserProfileImagePath(userId: string, extension: string) {
    return path.join(this.resolveUserProfileImageDir(userId), `avatar${extension}`);
  }

  resolveAbsolutePath(relativePath: string) {
    return path.join(process.cwd(), "storage", ...relativePath.split("/"));
  }

}
