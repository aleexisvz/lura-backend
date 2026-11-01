import "dotenv/config";
import { resolveTestDatabaseUrl } from "./test-database-url.js";

const testDatabaseUrl = resolveTestDatabaseUrl();

process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL_TEST"] = testDatabaseUrl;
process.env["DATABASE_URL"] = testDatabaseUrl;
const jwtSecret = process.env["JWT_SECRET"];
process.env["JWT_SECRET"] =
  typeof jwtSecret === "string" && jwtSecret.length >= 10
    ? jwtSecret
    : "test-secret-12345";
process.env["JWT_EXPIRES_IN"] = process.env["JWT_EXPIRES_IN"] ?? "15m";

process.env["S3_ENDPOINT"] = process.env["S3_ENDPOINT"] ?? "https://mock-r2.cloudflarestorage.com";
process.env["S3_ACCESS_KEY"] = process.env["S3_ACCESS_KEY"] ?? "test-access-key";
process.env["S3_SECRET_KEY"] = process.env["S3_SECRET_KEY"] ?? "test-secret-key";
process.env["S3_BUCKET_NAME"] = process.env["S3_BUCKET_NAME"] ?? "lura-test-bucket";
process.env["S3_PUBLIC_URL"] = process.env["S3_PUBLIC_URL"] ?? "https://cdn.test.lura.app";
