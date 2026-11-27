import { Readable } from "stream";
import {
  S3Client,
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env } from "../../config/env.js";
import { cacheControlForKey } from "./cache-control.js";

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


  async saveStream(stream: Readable, filepath: string, contentType?: string) {
    const key = this.normalizeKey(filepath);
    const cacheControl = cacheControlForKey(key);
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ...(contentType ? { ContentType: contentType } : {}),
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
      },
    });
    await upload.done();
  }

  /** Lists every key under a prefix, following the pagination of the bucket listing. */
  async listAllKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.normalizeKey(prefix),
          ContinuationToken: continuationToken,
        })
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }

  /** Reads the Cache-Control header currently stored for an object (undefined when it has none). */
  async getCacheControl(filepath: string): Promise<string | undefined> {
    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.normalizeKey(filepath) })
    );
    return head.CacheControl;
  }

  /**
   * Sets the Cache-Control header of an existing object by copying it onto itself. The content, content
   * type and custom metadata are kept as they are.
   */
  async setCacheControl(filepath: string, cacheControl: string) {
    const key = this.normalizeKey(filepath);
    const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: key,
        CopySource: `${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
        MetadataDirective: "REPLACE",
        CacheControl: cacheControl,
        ...(head.ContentType ? { ContentType: head.ContentType } : {}),
        ...(head.Metadata ? { Metadata: head.Metadata } : {}),
      })
    );
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

  async getFileBuffer(filepath: string): Promise<Buffer> {
    const data = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.normalizeKey(filepath),
      })
    );
    const bytes = await (data.Body as any).transformToByteArray();
    return Buffer.from(bytes);
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

  // --- Object Key Mapping & CDN Resolution ---

  /**
   * Generates a fully qualified public CDN URL for a given storage key.
   * Concatenates the public CDN domain with the sanitized object key.
   */
  getPublicUrl(filepath: string) {
    const baseUrl = env.S3_PUBLIC_URL.replace(/\/$/, "");
    return `${baseUrl}/${this.normalizeKey(filepath)}`;
  }

  /**
   * Sanitizes relative paths for S3/Cloudflare R2:
   * 1. Converts Windows-style backslashes ('\\') to forward slashes ('/').
   * 2. Strips leading slashes to produce a valid relative object key.
   */
  private normalizeKey(filepath: string) {
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
