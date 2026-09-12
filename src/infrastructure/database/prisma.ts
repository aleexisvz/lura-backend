import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

function resolveDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // If connecting to Neon without the pooler hostname, switch to Neon's PgBouncer pooler
    if (parsed.hostname.includes("neon.tech") && !parsed.hostname.includes("-pooler")) {
      const parts = parsed.hostname.split(".");
      if (parts[0] && !parts[0].endsWith("-pooler")) {
        parts[0] = `${parts[0]}-pooler`;
        parsed.hostname = parts.join(".");
      }
    }
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "30");
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const connectionString = resolveDatabaseUrl(env.DATABASE_URL);

// A single connection pool is shared across the whole application.
// Using pg.Pool (instead of a single connection) allows Prisma to
// reuse idle connections and handle bursts without opening a new
// TCP connection for every query.
const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
});

pool.on("error", (err) => {
  // Prevent unhandled errors from crashing the process when serverless DB closes idle sockets
  logger.warn({ err: err.message }, "[Database Pool] Idle client error");
});

const adapter = new PrismaPg(pool);

// Module-level singleton: imported from any file, all callers share
// the same PrismaClient instance and therefore the same pool.
export const prisma = new PrismaClient({ adapter });

