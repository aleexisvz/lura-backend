import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service.js";

const RegisterSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: FastifyRequest, reply: FastifyReply) => {
    const dto = RegisterSchema.parse(req.body);
    const result = await this.service.register(dto);
    return reply.send(result);
  };

  login = async (req: FastifyRequest, reply: FastifyReply) => {
    const dto = LoginSchema.parse(req.body);
    const result = await this.service.login(dto);
    return reply.send(result);
  };
}