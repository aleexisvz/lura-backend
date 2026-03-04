import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default("15m"),
});

export const env = EnvSchema.parse(process.env);