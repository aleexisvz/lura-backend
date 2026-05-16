import type { FastifyReply, FastifyRequest } from "fastify";
import { UsersService } from "./users.service.js";

export class UsersController {
  constructor(private readonly service: UsersService) {}

  getMe = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.service.getMe(userId);
    return reply.send(user);
  };

  uploadProfileImage = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const result = await this.service.uploadProfileImage(req, userId);
    return reply.send(result);
  };

  streamProfileImage = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    return this.service.streamProfileImage(reply, userId);
  };
}

