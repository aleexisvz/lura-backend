# Lura — Backend Architecture

## Directory Structure

```
src/
├── config/             # Environment variables (Zod), logger (Pino), Fastify plugins
├── infrastructure/     # External integrations: Cloudflare R2 / S3 (CloudStorageService), DB adapter
├── modules/
│   ├── auth/           # Registration, login, JWT issuance, admin promotion
│   ├── book/           # EPUB book catalog, uploads, covers, and reading progress store
│   ├── collections/    # User custom collections and shelf organization
│   ├── ingestion/      # Filesystem directory watchers and automated chapter import
│   ├── manga/          # Manga series, volumes, pages, covers, rankings, and featured queries
│   ├── reading/        # Reading sessions, reading XP gamification, progress tracking, volume completion
│   ├── tags/           # Tagging taxonomy (genres, themes) scoped by content type
│   └── users/          # User profile management, avatar uploads, and personal settings
└── shared/             # Cross-cutting concerns: AppError, auth guards, HTTP helpers, schemas
```

---

## Architectural Pattern

**Modular by Feature**: The codebase is strictly partitioned into domain modules rather than global functional layers.

Each module follows a consistent 4-tier lifecycle:
- **Routes / Controller**: Thin HTTP transport layer (`FastifyInstance` routes + request/reply controllers). Validates input schemas (Zod) and maps errors.
- **Service**: Pure business logic, authorization rules, coordinates storage, and calculates domain values (e.g. XP calculation, volume status transitions).
- **Repository**: Isolated database access through Prisma Client with `@prisma/adapter-pg`. Never call Prisma directly from services.
- **Types / Schemas**: Strongly typed domain models, input/output DTOs, and validation schemas.

---

## Execution Flow

```
HTTP Request
    │
    ▼
Fastify Hooks (Rate Limit, Auth Guard, Request Logging)
    │
    ▼
Module Controller (Unpacks params, query, body)
    │
    ▼
Module Service (Business logic, transactions, rules)
    ├──► Infrastructure (CloudStorageService / Cloudflare R2)
    └──► Module Repository
             │
             ▼
        Prisma ORM (@prisma/adapter-pg)
             │
             ▼
        PostgreSQL Database
```

---

## Storage Architecture (Cloudflare R2)

All binary assets (manga page images, covers, avatars, and EPUB files) are managed via `CloudStorageService` using `@aws-sdk/client-s3`:

1. **Object Key Hierarchy**:
   - Manga pages: `manga/{mangaId}/volumes/{volumeId}/pages/{filename}`
   - Manga covers: `manga/{mangaId}/cover/cover.{ext}`
   - Volume covers: `manga/{mangaId}/volumes/{volumeId}/cover/cover.{ext}`
   - Book EPUB files: `books/{bookId}/book.epub`
   - Book covers: `books/{bookId}/cover/cover.{ext}`
   - User avatars: `users/{userId}/profile/avatar.{ext}`

2. **CDN Delivery**:
   - Backend **never proxies or streams** image content in production.
   - All response DTOs provide absolute, public Cloudflare R2 CDN URLs (`storage.getPublicUrl(key)`).
   - Internal storage keys, S3 buckets, and local filesystem paths are strictly withheld from client responses.

---

## Error Pipeline & Logging

- Centralized `AppError` class with predefined domain codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_PARAMS`, etc.).
- Dual-hook response normalization (`preSerialization` and `onSend`) ensures that **every** error response strictly satisfies:
  ```json
  {
    "code": "ERROR_CODE",
    "message": "Human readable explanation",
    "details": null
  }
  ```
- **Adaptive Logging**: In development, request summaries are logged with response times in milliseconds. In production, structured JSON logging is handled by Pino.
