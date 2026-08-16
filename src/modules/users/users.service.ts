import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { badRequest, notFound } from "../../shared/errors/error-factory.js";
import { getImageContentType } from "../../shared/utils/get-image-content-type.js";
import { buildReadingLevelSnapshot } from "../reading/reading-xp.js";
import { UsersRepository } from "./users.repository.js";
import type { PublicUserDTO } from "./users.types.js";

const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly storage: CloudStorageService
  ) {}

  async getMe(userId: string): Promise<PublicUserDTO> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "User not found");
    }

    return this.toPublicUser(user);
  }

  async uploadProfileImage(req: FastifyRequest, userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "User not found");
    }

    const file = await this.getRequiredImageFile(req);
    const extension = this.resolveImageExtension(file.filename, file.mimetype);
    const imageDir = this.storage.resolveUserProfileImageDir(userId);
    const absolutePath = this.storage.resolveUserProfileImagePath(userId, extension);
    const relativePath = path.posix.join("users", userId, "profile", `avatar${extension}`);

    await this.storage.ensureDir(imageDir);
    await this.storage.removeFilesByPrefix(imageDir, "avatar.");
    await this.storage.saveStream(file.file, absolutePath);
    const updated = await this.repo.updateProfileImagePath(userId, relativePath);

    return {
      uploaded: true,
      profileImageUrl: updated.profileImagePath ? "/users/me/profile-image" : null,
    };
  }

  async streamProfileImage(reply: FastifyReply, userId: string) {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "User not found");
    }

    if (!user.profileImagePath) {
      throw notFound("USER_PROFILE_IMAGE_NOT_FOUND", "Profile image not found");
    }

    const filepath = this.storage.resolveAbsolutePath(user.profileImagePath);
    const exists = await this.storage.exists(filepath);
    if (!exists) {
      throw notFound("PROFILE_IMAGE_FILE_NOT_FOUND", "Profile image file not found");
    }

    const publicUrl = this.storage.getPublicUrl(filepath);
    return reply.redirect(publicUrl);
  }

  private async getRequiredImageFile(req: FastifyRequest) {
    let file: Awaited<ReturnType<FastifyRequest["file"]>>;
    try {
      file = await req.file({
        limits: {
          files: 1,
          fileSize: PROFILE_IMAGE_MAX_BYTES,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        throw badRequest("INVALID_PARAMS", "Profile image exceeds 2MB limit");
      }
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    if (!file) {
      throw badRequest("NO_FILES_UPLOADED", "No files uploaded");
    }

    return file;
  }

  private resolveImageExtension(filename: string | undefined, mimetype: string) {
    const extension = path.extname(filename ?? "").toLowerCase();
    if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp") {
      return extension;
    }

    if (mimetype === "image/png") return ".png";
    if (mimetype === "image/jpeg") return ".jpeg";
    if (mimetype === "image/webp") return ".webp";

    throw badRequest("INVALID_PARAMS", "Invalid profile image file");
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    username: string;
    role: "USER" | "ADMIN";
    createdAt: Date;
    profileImagePath: string | null;
    readingXpTotal: number;
  }): PublicUserDTO {
    const levelSnapshot = buildReadingLevelSnapshot(user.readingXpTotal);

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      profileImageUrl: user.profileImagePath ? "/users/me/profile-image" : null,
      readingXpTotal: levelSnapshot.readingXpTotal,
      readingLevel: levelSnapshot.readingLevel,
    };
  }
}
