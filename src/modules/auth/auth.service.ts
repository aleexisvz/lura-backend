import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { AuthRepository } from "./auth.repository.js";
import type { AuthResponseDTO, LoginDTO, RegisterDTO } from "./auth.types.js";
import { AppError } from "../../shared/errors/AppError.js";

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly app: FastifyInstance
  ) {}

  async register(dto: RegisterDTO): Promise<AuthResponseDTO> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.repo.findUserByEmail(email);
    if (existing) {
      throw new AppError({
        code: "EMAIL_ALREADY_IN_USE",
        statusCode: 409,
        message: "Email already in use",
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.repo.createUser(email, passwordHash);

    const token = this.app.jwt.sign(
      { email: user.email, role: user.role },
      { sub: user.id }
    );

    return { token, user };
  }

  async login(dto: LoginDTO): Promise<AuthResponseDTO> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      throw new AppError({
        code: "INVALID_CREDENTIALS",
        statusCode: 401,
        message: "Invalid credentials",
      });
    }

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new AppError({
        code: "INVALID_CREDENTIALS",
        statusCode: 401,
        message: "Invalid credentials",
      });
    }

    const token = this.app.jwt.sign(
      { email: user.email, role: user.role },
      { sub: user.id }
    );

    return { token, user: { id: user.id, email: user.email } };
  }
}