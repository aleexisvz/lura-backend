import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { badRequest, conflict, notFound } from "../../shared/errors/error-factory.js";
import { getImageContentType } from "../../shared/utils/get-image-content-type.js";
import { buildReadingLevelSnapshot } from "../reading/reading-xp.js";
import { MangaProgressRepository } from "../reading/manga-progress.repository.js";
import { MangaProgressService } from "../reading/manga-progress.service.js";
import { ReadingSessionRepository } from "../reading/reading-session.repository.js";
import { ReadingSessionService } from "../reading/reading-session.service.js";
import { UsersRepository } from "./users.repository.js";
import type { PublicUserDTO, PublicUserProfileDTO, UserRankingDTO, UserSearchResultDTO } from "./users.types.js";

const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly storage: CloudStorageService,
    private readonly readingSessionService = new ReadingSessionService(new ReadingSessionRepository()),
    private readonly mangaProgressService = new MangaProgressService(new MangaProgressRepository())
  ) {}

  async getMe(userId: string): Promise<PublicUserDTO> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "User not found");
    }

    return this.toPublicUser(user);
  }

  async updateUsername(userId: string, rawUsername: string): Promise<PublicUserDTO> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "User not found");
    }

    const username = rawUsername.trim();

    if (username.toLowerCase() === user.username.toLowerCase()) {
      if (username === user.username) {
        return this.toPublicUser(user);
      }
    } else {
      const existing = await this.repo.findUserByUsername(username);
      if (existing && existing.id !== userId) {
        throw conflict("USERNAME_ALREADY_IN_USE", "Username already in use");
      }
    }

    const updated = await this.repo.updateUsername(userId, username);
    return this.toPublicUser(updated);
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

    await this.storage.removeFilesByPrefix(imageDir, "avatar.");
    await this.storage.saveStream(file.file, absolutePath);
    const updated = await this.repo.updateProfileImagePath(userId, relativePath);

    return {
      uploaded: true,
      profileImageUrl: updated.profileImagePath ? this.storage.getPublicUrl(updated.profileImagePath) : null,
    };
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

  async getPublicProfile(rawUsername: string): Promise<PublicUserProfileDTO> {
    const username = rawUsername.trim();
    const user = await this.repo.findPublicProfileByUsername(username);
    if (!user) {
      throw notFound("USER_NOT_FOUND", "Usuario no encontrado");
    }

    const levelSnapshot = buildReadingLevelSnapshot(user.readingXpTotal);

    const [stats, recentSeries, continueReading] = await Promise.all([
      this.readingSessionService.getUserReadingStats(user.id),
      this.readingSessionService.getRecentSeries(user.id, 12),
      this.mangaProgressService.getContinueReading(user.id),
    ]);

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      profileImageUrl: user.profileImagePath ? this.storage.getPublicUrl(user.profileImagePath) : null,
      readingXpTotal: levelSnapshot.readingXpTotal,
      readingLevel: levelSnapshot.readingLevel,
      stats,
      recentSeries,
      continueReading,
    };
  }

  async searchUsers(query: string, limit = 10): Promise<UserSearchResultDTO[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const users = await this.repo.searchUsers(trimmed, limit);

    return users.map((u) => {
      const levelSnapshot = buildReadingLevelSnapshot(u.readingXpTotal);
      return {
        id: u.id,
        username: u.username,
        profileImageUrl: u.profileImagePath ? this.storage.getPublicUrl(u.profileImagePath) : null,
        readingLevel: levelSnapshot.readingLevel,
        readingXpTotal: levelSnapshot.readingXpTotal,
      };
    });
  }

  async getRankings(limit = 10): Promise<UserRankingDTO[]> {
    const users = await this.repo.findTopRankings(limit);

    return users.map((u, index) => {
      const levelSnapshot = buildReadingLevelSnapshot(u.readingXpTotal);
      return {
        rank: index + 1,
        id: u.id,
        username: u.username,
        role: u.role,
        profileImageUrl: u.profileImagePath ? this.storage.getPublicUrl(u.profileImagePath) : null,
        readingLevel: levelSnapshot.readingLevel,
        readingXpTotal: levelSnapshot.readingXpTotal,
        readingTimeTotalSeconds: u.readingTimeTotalSeconds,
      };
    });
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
      profileImageUrl: user.profileImagePath ? this.storage.getPublicUrl(user.profileImagePath) : null,
      readingXpTotal: levelSnapshot.readingXpTotal,
      readingLevel: levelSnapshot.readingLevel,
    };
  }
}
