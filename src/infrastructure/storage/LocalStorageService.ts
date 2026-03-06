import fs from "fs"
import path from "path"
import { pipeline } from "stream/promises"

export class LocalStorageService {

  async ensureDir(dir: string) {
    await fs.promises.mkdir(dir, { recursive: true })
  }

  async saveStream(stream: NodeJS.ReadableStream, filepath: string) {
    await pipeline(stream, fs.createWriteStream(filepath))
  }

  async moveDir(src: string, dest: string) {
    await fs.promises.rename(src, dest)
  }

  async listFiles(dir: string) {
    return fs.promises.readdir(dir)
  }

}