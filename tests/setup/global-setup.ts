import "dotenv/config";
import { resolveTestDatabaseUrl } from "./test-database-url.js";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureTestDatabase(testDatabaseUrl: string) {
  const testUrl = new URL(testDatabaseUrl);
  const testDbName = testUrl.pathname.replace(/^\//, "");

  if (!testDbName) {
    throw new Error("DATABASE_URL_TEST must include a database name");
  }

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = "/postgres";

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();

  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1 LIMIT 1",
    [testDbName]
  );

  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${quoteIdentifier(testDbName)}`);
  }

  await client.end();
}

export default async function globalSetup() {
  const testDatabaseUrl = resolveTestDatabaseUrl();

  process.env["DATABASE_URL_TEST"] = testDatabaseUrl;

  try {
    await ensureTestDatabase(testDatabaseUrl);
  } catch (error) {
    // Do not print the URL: it contains credentials.
    const host = new URL(testDatabaseUrl).host;
    throw new Error(`Cannot connect to the test database at ${host}. Start it with: docker compose up -d`, { cause: error });
  }

  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  );

  execSync("npx prisma migrate deploy", {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      // prisma.config.ts prefers DIRECT_DATABASE_URL, so it must point at the test database too.
      DIRECT_DATABASE_URL: testDatabaseUrl,
    },
  });
}
