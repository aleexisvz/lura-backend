// Local Postgres from docker-compose.yml. Used when DATABASE_URL_TEST is not set,
// so tests do not run against the shared development database by default.
const DEFAULT_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/lura_test";

export function resolveTestDatabaseUrl(): string {
  return process.env["DATABASE_URL_TEST"] ?? DEFAULT_TEST_DATABASE_URL;
}
