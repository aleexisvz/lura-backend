import "dotenv/config";

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

const rawDatabaseUrl = process.env["DATABASE_URL"];
if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL is required to initialize test environment");
}

const testDatabaseUrl =
  process.env["DATABASE_URL_TEST"] ?? deriveTestDatabaseUrl(rawDatabaseUrl);

process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL_TEST"] = testDatabaseUrl;
process.env["DATABASE_URL"] = testDatabaseUrl;
const jwtSecret = process.env["JWT_SECRET"];
process.env["JWT_SECRET"] =
  typeof jwtSecret === "string" && jwtSecret.length >= 10
    ? jwtSecret
    : "test-secret-12345";
process.env["JWT_EXPIRES_IN"] = process.env["JWT_EXPIRES_IN"] ?? "15m";
