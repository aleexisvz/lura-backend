import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { AuthRepository } from "./auth.repository.js";
import type { AuthResponseDTO, LoginDTO, RegisterDTO } from "./auth.types.js";
import { AppError } from "../../shared/errors/AppError.js";

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    // The Fastify instance is injected to access app.jwt.sign, which requires
    // the JWT secret configured in plugins.ts via @fastify/jwt.
    private readonly app: FastifyInstance
  ) {}

  async register(dto: RegisterDTO): Promise<AuthResponseDTO> {
    // Normalize the email so "User@Example.COM" and "user@example.com" are
    // treated as the same account. The trim removes accidental whitespace.
    const email = dto.email.trim().toLowerCase();

    const existing = await this.repo.findUserByEmail(email);
    if (existing) {
      throw new AppError({
        code: "EMAIL_ALREADY_IN_USE",
        statusCode: 409,
        message: "Email already in use",
      });
    }

    // Salt rounds = 10 is the bcrypt default and a good balance between
    // security and performance (~100ms on modern hardware).
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.repo.createUser(email, passwordHash);

    // JWT payload: { email, role } are custom claims; sub (subject) = userId
    // follows the JWT standard and is used to identify the user on each request.
    // Example decoded payload: { sub: "cuid...", email: "a@b.com", role: "USER" }
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
      // Return the same error code for "user not found" and "wrong password"
      // to prevent user enumeration (attackers can't tell which one failed).
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

    // The password field is intentionally omitted from the response —
    // only the public user shape is returned.
    return { token, user: { id: user.id, email: user.email } };
  }
}