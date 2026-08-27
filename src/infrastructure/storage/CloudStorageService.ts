import { Readable } from "stream";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../../config/env.js";

export class CloudStorageService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = env.S3_BUCKET_NAME;
    this.s3 = new S3Client({
      region: "auto", // Cloudflare R2 uses 'auto'
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }


  async saveStream(stream: Readable, filepath: string) {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: this.normalizeKey(filepath),
        Body: stream,
      },
    });
    await upload.done();
  }


  async listFiles(dir: string) {
    const prefix = this.normalizeKey(dir) + "/";
    const listedObjects = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix })
    );
    return (listedObjects.Contents || []).map(obj => obj.Key?.replace(prefix, "") || "");
  }

  async exists(filepath: string) {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.normalizeKey(filepath),
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async createReadStream(filepath: string) {
    const data = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.normalizeKey(filepath),
      })
    );
    return data.Body as NodeJS.ReadableStream;
  }

  async getFileStats(filepath: string) {
    const head = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.normalizeKey(filepath),
      })
    );
    return {
      size: head.ContentLength || 0,
      mtime: head.LastModified || new Date(),
    };
  }

  async removeFilesByPrefix(dir: string, prefix: string) {
    const fullPrefix = this.normalizeKey(dir) + "/" + prefix;
    const listedObjects = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: fullPrefix })
    );

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: listedObjects.Contents.filter((obj) => obj.Key).map((obj) => ({ Key: obj.Key! })),
        },
      })
    );
  }

  async deleteVolumeFiles(mangaId: string, volumeId: string) {
    const prefix = this.normalizeKey(`manga/${mangaId}/volumes/${volumeId}`);
    const listedObjects = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix })
    );

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: listedObjects.Contents.filter((obj) => obj.Key).map((obj) => ({ Key: obj.Key! })),
        },
      })
    );
  }

  async deleteMangaFiles(mangaId: string) {
    const prefix = this.normalizeKey(`manga/${mangaId}`);
    const listedObjects = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix })
    );

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) return;

    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: listedObjects.Contents.filter((obj) => obj.Key).map((obj) => ({ Key: obj.Key! })),
        },
      })
    );
  }

  // --- Mapeo de rutas (Keys en S3) ---
  // A diferencia de LocalStorage, aquí devolvemos strings limpios (sin process.cwd())

  getPublicUrl(filepath: string) {
    const baseUrl = env.S3_PUBLIC_URL.replace(/\/$/, "");
    return `${baseUrl}/${this.normalizeKey(filepath)}`;
  }

  private normalizeKey(filepath: string) {
    // Si la ruta viene con barras invertidas (Windows), las convertimos a barras normales (S3)
    return filepath.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  resolveMangaPagePath(mangaId: string, volumeId: string, filename: string) {
    return `manga/${mangaId}/volumes/${volumeId}/pages/${filename}`;
  }

  resolveBookEpubPath(bookId: string) {
    return `books/${bookId}/book.epub`;
  }

  resolveMangaCoverDir(mangaId: string) {
    return `manga/${mangaId}/cover`;
  }

  resolveMangaCoverPath(mangaId: string, extension: string) {
    return `${this.resolveMangaCoverDir(mangaId)}/cover${extension}`;
  }

  resolveVolumeCoverDir(mangaId: string, volumeId: string) {
    return `manga/${mangaId}/volumes/${volumeId}/cover`;
  }

  resolveVolumeCoverPath(mangaId: string, volumeId: string, extension: string) {
    return `${this.resolveVolumeCoverDir(mangaId, volumeId)}/cover${extension}`;
  }

  resolveBookCoverDir(bookId: string) {
    return `books/${bookId}/cover`;
  }

  resolveBookCoverPath(bookId: string, extension: string) {
    return `${this.resolveBookCoverDir(bookId)}/cover${extension}`;
  }

  resolveUserProfileImageDir(userId: string) {
    return `users/${userId}/profile`;
  }

  resolveUserProfileImagePath(userId: string, extension: string) {
    return `${this.resolveUserProfileImageDir(userId)}/avatar${extension}`;
  }

}
