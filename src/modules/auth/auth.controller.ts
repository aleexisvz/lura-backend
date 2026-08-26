import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service.js";

const RegisterSchema = z.object({
  email: z.string().trim().email(),
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(32, "Username cannot exceed 32 characters")
    .regex(/^[\p{L}\p{N}_-]+$/u, "Username can only contain letters, numbers, Kanji/Japanese characters, underscores, and hyphens"),
  password: z.string().min(6),
  role: z.enum(["USER", "ADMIN"]).optional(),
});

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const PromoteSchema = z.object({
  email: z.string().trim().email(),
});

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: FastifyRequest, reply: FastifyReply) => {
    const dto = RegisterSchema.parse(req.body);
    const result = await this.service.register({
      email: dto.email,
      username: dto.username,
      password: dto.password,
      ...(dto.role ? { role: dto.role } : {}),
    });
    return reply.send(result);
  };

  login = async (req: FastifyRequest, reply: FastifyReply) => {
    const dto = LoginSchema.parse(req.body);
    const result = await this.service.login(dto);
    return reply.send(result);
  };

  promoteToAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const { email } = PromoteSchema.parse(req.body);
    const user = await this.service.promoteToAdmin(email);
    return reply.send(user);
  };
}
