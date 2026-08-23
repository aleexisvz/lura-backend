import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { env } from "../../config/env.js";

// A single connection pool is shared across the whole application.
// Using pg.Pool (instead of a single connection) allows Prisma to
// reuse idle connections and handle bursts without opening a new
// TCP connection for every query.
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Module-level singleton: imported from any file, all callers share
// the same PrismaClient instance and therefore the same pool.
export const prisma = new PrismaClient({ adapter });

