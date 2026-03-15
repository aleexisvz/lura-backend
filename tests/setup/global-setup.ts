import "dotenv/config";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function deriveTestDatabaseUrl(rawDatabaseUrl: string): string {
  const parsed = new URL(rawDatabaseUrl);
  const dbName = parsed.pathname.replace(/^\//, "");

  if (!dbName) {
    throw new Error("DATABASE_URL must include a database name");
  }

  const testDbName = dbName.endsWith("_test") ? dbName : `${dbName}_test`;
  parsed.pathname = `/${testDbName}`;

  return parsed.toString();
}

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
  const rawDatabaseUrl = process.env["DATABASE_URL"];
  if (!rawDatabaseUrl) {
    throw new Error("DATABASE_URL is required to run tests");
  }

  const testDatabaseUrl =
    process.env["DATABASE_URL_TEST"] ?? deriveTestDatabaseUrl(rawDatabaseUrl);

  process.env["DATABASE_URL_TEST"] = testDatabaseUrl;

  await ensureTestDatabase(testDatabaseUrl);

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
    },
  });
}
