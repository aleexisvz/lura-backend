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