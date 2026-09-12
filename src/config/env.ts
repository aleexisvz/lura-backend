import { config } from "dotenv";
import { z } from "zod";

// Forzamos a dotenv a sobreescribir las variables del sistema con las del .env solo si no estamos en test
if (process.env.NODE_ENV !== "test") {
  config({ override: true });
} else {
  config();
}

// All environment variables are validated at startup.
// If a required variable is missing or fails its constraint,
// Zod throws immediately and the process does not start.
const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // z.coerce.number() converts the raw string "3001" to the number 3001
  // automatically, so PORT can be used directly as a number throughout the app.
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(10),
  // Accepts any value understood by the jsonwebtoken "expiresIn" option.
  // Examples: "15m", "1h", "7d".
  JWT_EXPIRES_IN: z.string().default("15m"),

  // Cloud Storage (R2 / S3)
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_NAME: z.string().min(1),
  S3_PUBLIC_URL: z.string().url(),

  READING_XP_PER_MINUTE: z.coerce.number().int().positive().default(2),
  READING_XP_SESSION_CAP_SECONDS: z.coerce.number().int().positive().default(1800),
  READING_XP_WEEKEND_MULTIPLIER: z.coerce.number().int().positive().default(2),
});

export const env = EnvSchema.parse(process.env);
