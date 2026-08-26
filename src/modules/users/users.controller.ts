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
}

