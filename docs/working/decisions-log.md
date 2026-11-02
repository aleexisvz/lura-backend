# Decisions Log — Lura Backend

## Architecture
- **Feature-based Modular Structure**: Adopted over global horizontal layers to keep routes, services, repositories, and domain types grouped by domain concept.
- **Repository Pattern**: Strict isolation of Prisma Client in the repository layer to prevent ORM leaks into business logic.

## Storage
- **Cloudflare R2 Object Storage**: Replaced local filesystem storage with Cloudflare R2 (S3 API compatibility). This eliminates local disk saturation and enables direct client CDN streaming.
- **Direct CDN Delivery**: All media endpoints return absolute CDN URLs. The backend does not stream image bytes directly.

## Reading Engine
- **Session Auto-Closing**: Starting a new reading session automatically finalizes any open, dangling session, preventing inflated reading times caused by abrupt browser crashes.
- **Session Duration Capping**: Maximum reading duration per session is capped (default 30 minutes) to prevent idle session exploitation.
- **Monotonic Lifetime Stats**: When resetting a volume's progress to re-read, read pages are accumulated into `historicalPagesRead` so cumulative profile statistics never drop.
- **Weekend XP Event**: Automated 2x multiplier applied during Saturday and Sunday (UTC) to incentivize reading activity.

## Observability
- **Pino Adaptive Request Logging**: Replaced noisy multi-line logs with concise single-line HTTP summaries in development, retaining structured JSON output for production environments.

## Operations
- **Health Endpoints Without Rate Limit**: `/health` and `/health/ready` are exempt from the global rate limit, because monitors poll them often and a 429 would make a healthy instance look down.
- **Readiness Error Body**: The 503 body follows the standard `{ code, message, details }` contract, because the app normalizes every error response to that shape. Internal database errors are logged, not returned.
- **Graceful Shutdown Budget**: The HTTP close is capped at 10 s; after that the process closes the database and exits, so a stuck request cannot block a deploy.
- **Local Test Database by Default**: Tests use `localhost:5432/lura_test` unless `DATABASE_URL_TEST` is set. Shared remote databases are not used for tests, because the reset helper truncates tables and remote locks made runs flaky.

## Tooling & Process
- **pnpm Only**: `pnpm-lock.yaml` is the only lockfile. `package-lock.json` was removed because two lockfiles gave two sources of truth. The version is fixed in `packageManager`; the CI workflow must not set a second version.
- **Three-Level Commit Workflow**: Branches are PRs, groups of commits are solutions, and commits are small logical changes. PRs are merged with rebase so every commit reaches `main`.
- **Test Timeouts**: Tests and hooks have a 30 s timeout, because queries against a remote database can be slow.

## Storage & Reading
- **Book Progress in PostgreSQL**: Moved from `storage/book-progress.json` to the `BookProgress` table with a unique `(userId, bookId)` key. The old store had a cross-user fallback key, which is why it was replaced.
- **Bounded EPUB Cache**: The in-memory EPUB cache is capped at 200 MB with least-recently-used eviction, so memory does not grow with every book opened.