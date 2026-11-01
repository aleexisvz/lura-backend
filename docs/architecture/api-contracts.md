# Lura — API Contracts

## Standard Error Response Shape

All API errors (Fastify validation, route errors, business logic exceptions, and unhandled server errors) return this standard JSON shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable explanation",
  "details": null
}
```

- `code`: Stable, machine-readable string identifier for programmatic handling on the client (e.g. `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_PARAMS`, `CONFLICT`).
- `message`: User-facing description.
- `details`: Optional validation issues array (e.g. Zod validation issues) or extra diagnostic context; defaults to `null`.

---

## Health (`/health`)

No authentication, and excluded from the rate limit. Intended for monitors and hosting platforms.

- `GET /health` — Liveness: the process is running. Returns `{ "status": "ok" }`.
- `GET /health/ready` — Readiness: runs `SELECT 1` on the database. Returns `{ "status": "ok", "checks": { "database": "ok" } }` with 200, or 503 with `{ "code": "DATABASE_UNAVAILABLE", "message": "Database is unavailable", "details": null }`. The database error itself is logged, not returned.

---

## Authentication (`/auth`)

- `POST /auth/register` — Register a new account (`username`, `email`, `password`).
- `POST /auth/login` — Authenticate and receive a Bearer JWT token (`email`, `password`).
- `POST /auth/promote` (Admin) — Promote a target user to `ADMIN` role (`userId`).

---

## Users (`/users`)

- `GET /users/me` — Retrieve the authenticated user profile, stats, and role.
- `PATCH /users/me` — Update user profile details (e.g. `username`).
- `POST /users/me/upload-profile-image` — Upload avatar image (multipart form-data). Returns `{ profileImageUrl }` as an absolute CDN URL.
- `GET /users/search?q=` — Search users by username (`query` is accepted as an alias of `q`). Optional `limit` (1–50, default 10). Returns `[{ id, username, profileImageUrl, readingLevel, readingXpTotal }]`.
- `GET /users/rankings?limit=` — Top users by XP. `limit` 1–50, default 5. Returns `[{ rank, id, username, profileImageUrl, readingLevel, readingXpTotal, readingTimeTotalSeconds, role }]`.
- `GET /users/:username` — Public profile: `{ id, username, role, createdAt, profileImageUrl, readingXpTotal, readingLevel, stats, recentSeries: { manga, books }, continueReading }`. `stats` has the same fields as `GET /users/me/reading-stats`.

---

## Manga Catalog (`/manga`)

- `GET /manga` — List all mangas with optional pagination and genre filtering.
- `GET /manga/featured` — Retrieve featured mangas.
- `GET /manga/recent-updates` — Retrieve recently updated manga series.
- `GET /manga/rankings` — Retrieve popular/top-rated manga series.
- `GET /manga/:mangaId` — Retrieve manga series details, description, genres, and volume list.
- `GET /manga/:mangaId/volumes` — List volumes for a specific manga.
- `GET /manga/:mangaId/volumes/:volumeId/pages` — List pages of a volume:
  ```json
  {
    "volume": {
      "id": "vol_id",
      "volumeNumber": 1,
      "title": "Volume 1",
      "totalPages": 20
    },
    "pages": [
      { "pageNumber": 1, "imageUrl": "https://pub-...r2.dev/manga/.../pages/001.webp" }
    ]
  }
  ```
- `POST /manga` (Admin) — Create a manga entry.
- `PATCH /manga/:mangaId` (Admin) — Update manga metadata.
- `POST /manga/:mangaId/upload-cover` (Admin) — Upload series cover image.
- `POST /manga/:mangaId/volumes` (Admin) — Create a new volume record.
- `PATCH /manga/:mangaId/volumes/:volumeId` (Admin) — Update volume details.
- `POST /manga/:mangaId/volumes/:volumeId/upload-cover` (Admin) — Upload volume cover image.
- `POST /manga/:mangaId/volumes/:volumeId/upload` (Admin) — Upload volume page images (multipart form-data).

---

## Books Catalog (`/books`)

- `GET /books` — List all books with metadata and cover CDN URLs.
- `GET /books/:bookId` — Retrieve single book details.
- `GET /books/:bookId/file` — Retrieve book EPUB file stream or CDN location.
- `GET /books/rankings?limit=` — Most-read books. `limit` 1–50, default 5. Returns `[{ rank, readersCount, book }]`.
- `GET /books/:bookId/readers` — Up to 10 users with the most recent progress on the book. Returns `[{ id, username, profileImageUrl, readingLevel, readingXpTotal, lastReadAt }]`.
- `GET /books/:bookId/progress` — Retrieve the user's reading progress for the book. Returns `null` when the user has no progress for it:
  ```json
  {
    "userId": "usr_id",
    "bookId": "bk_id",
    "spineIndex": 4,
    "sectionHref": "chapter1.xhtml",
    "locator": "epubcfi(/6/14[chapter1]!/4/2/10/1:0)",
    "progressPercent": 42.5,
    "currentPage": 85,
    "totalPages": 200,
    "completed": false,
    "updatedAt": "2026-09-12T10:00:00.000Z"
  }
  ```
- `PUT /books/:bookId/progress` — Save/sync reading progress for the book. Returns the saved record. Returns `404 BOOK_NOT_FOUND` if the book does not exist. Completion and `totalPages` rules are in `domain-rules.md`.
- `POST /books` (Admin) — Create a book record (`title`, `author`, `description`, `tagIds`).
- `PATCH /books/:bookId` (Admin) — Update book metadata.
- `POST /books/:bookId/upload-epub` (Admin) — Upload EPUB file (multipart form-data).
- `POST /books/:bookId/upload-cover` (Admin) — Upload book cover image (multipart form-data).

---

## Reading Sessions, Progress & Stats

- `POST /reading/sessions/start` — Start an active reading session:
  - Body: `{ "contentType": "MANGA" | "BOOK", "contentId": "..." }`
  - Returns: `{ "sessionId": "...", "startedAt": "..." }`
- `POST /reading/sessions/:sessionId/end` — End a reading session and award XP:
  - Returns: `{ "durationSeconds": 900, "xpAwarded": 60 }`
- `GET /users/me/reading-stats` — Unified statistics across Manga and Books:
  ```json
  {
    "totalSessions": 15,
    "totalMinutes": 180,
    "totalSeconds": 10800,
    "mangaSeconds": 7200,
    "bookSeconds": 3600,
    "totalPagesRead": 350,
    "mangaPagesRead": 250,
    "bookPagesRead": 100,
    "totalVolumesRead": 4,
    "totalMangasRead": 2,
    "totalSeriesRead": 2,
    "totalBooksRead": 1,
    "readingLevel": 5,
    "readingXpTotal": 420,
    "xpInLevel": 20,
    "xpToNextLevel": 100,
    "xpProgressPercent": 20,
    "activeXpEvent": "Hot Weekend",
    "isHotWeekend": true,
    "xpMultiplier": 2,
    "xpPerMinute": 4
  }
  ```
- `GET /users/me/continue-reading` — Items in progress (unifying manga and books) sorted by last read.
- `GET /users/me/recent-series` — Recently read manga series and books.
- `GET /manga/:mangaId/progress` — Current reading cursor for manga.
- `POST /manga/:mangaId/progress` — Update manga reading position (`volumeId`, `page`).
- `GET /manga/:mangaId/readers` — Up to 10 users with the most recent progress on the manga. Returns `[{ id, username, profileImageUrl, readingLevel, readingXpTotal, lastReadAt }]`.
- `GET /manga/:mangaId/volumes/:volumeId/complete` — Check volume completion status.
- `POST /manga/:mangaId/volumes/:volumeId/complete` — Mark volume as completed.
- `DELETE /manga/:mangaId/volumes/:volumeId/complete` — Reset volume completion to restart reading.

---

## Tags Taxonomy (`/tags`)

- `GET /tags?scope=MANGA|BOOK` — List available tags filtered by content scope.
- `POST /tags` (Admin) — Create a new tag (`name`, `slug`, `scope`).
