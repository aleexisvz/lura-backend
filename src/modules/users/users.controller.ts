import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { UsersService } from "./users.service.js";

const UpdateUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(32, "Username cannot exceed 32 characters")
    .regex(/^[\p{L}\p{N}_-]+$/u, "Username can only contain letters, numbers, Kanji/Japanese characters, underscores, and hyphens"),
});

const SearchUsersQuerySchema = z.object({
  q: z.string().trim().optional(),
  query: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const GetPublicProfileParamsSchema = z.object({
  username: z.string().trim().min(1),
});

export class UsersController {
  constructor(private readonly service: UsersService) {}

  getMe = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.service.getMe(userId);
    return reply.send(user);
  };

  updateMe = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { username } = UpdateUsernameSchema.parse(req.body);
    const updated = await this.service.updateUsername(userId, username);
    return reply.send(updated);
  };

  uploadProfileImage = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const result = await this.service.uploadProfileImage(req, userId);
    return reply.send(result);
  };

  searchUsers = async (req: FastifyRequest, reply: FastifyReply) => {
    const { q, query, limit } = SearchUsersQuerySchema.parse(req.query);
    const searchTerm = q ?? query ?? "";
    const users = await this.service.searchUsers(searchTerm, limit ?? 10);
    return reply.send(users);
  };

  getPublicProfile = async (req: FastifyRequest, reply: FastifyReply) => {
    const { username } = GetPublicProfileParamsSchema.parse(req.params);
    const profile = await this.service.getPublicProfile(username);
    return reply.send(profile);
  };

  getRankings = async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { limit?: string };
    const limit = query.limit ? Math.max(1, Math.min(50, parseInt(query.limit, 10) || 5)) : 5;
    const rankings = await this.service.getRankings(limit);
    return reply.send(rankings);
  };
}

