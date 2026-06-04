import "dotenv/config";
import { z } from "zod";

// All environment variables are validated at startup.
// If a required variable is missing or fails its constraint,
// Zod throws immediately and the process does not start.
const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  // z.coerce.number() converts the raw string "3001" to the number 3001
  // automatically, so PORT can be used directly as a number throughout the app.
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(10),
  // Accepts any value understood by the jsonwebtoken "expiresIn" option.
  // Examples: "15m", "1h", "7d".
  JWT_EXPIRES_IN: z.string().default("15m"),

  READING_XP_PER_MINUTE: z.coerce.number().int().positive().default(1),
  READING_XP_SESSION_CAP_SECONDS: z.coerce.number().int().positive().default(1800),
});

export const env = EnvSchema.parse(process.env);
