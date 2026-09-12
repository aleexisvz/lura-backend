# Lura — Domain Rules

## Content Model & Ownership

- **Global Entities**: Manga, Volume, Page, Book, and Tag entities are global and shared across all platform users.
- **Admin Managed**: Only users with the `ADMIN` role can create, update, delete, or upload media (pages, EPUBs, covers). Regular users do not own content records.
- **User Ownership**: Users own their reading progress (`MangaProgress`, book progress), reading sessions, reading statistics, user profile customization, and custom collections.

---

## Storage & CDN Delivery Rules

- **Cloudflare R2**: All storage objects are persisted in Cloudflare R2 through S3 API compatibility.
- **Path Abstraction**: Storage keys (`manga/{mangaId}/...`, `books/{bookId}/...`) and internal filenames must **never** be exposed in public API payloads.
- **Absolute Public URLs**: All media references returned in DTOs (`imageUrl`, `coverUrl`, `profileImageUrl`) must be absolute, fully-qualified public CDN URLs.
- **No Backend Streaming**: Media files are consumed directly from Cloudflare R2's global edge network. Fastify does not proxy or stream page images.

---

## Reading Sessions & Gamification (XP)

- **One Active Session**: A user can only have one active reading session at any given time. Starting a new session automatically closes any lingering unclosed session.
- **Session Duration Cap**: Auto-closed or manually submitted sessions are capped (default 30 minutes / `READING_XP_SESSION_CAP_SECONDS`) to prevent time inflation or cheating from background tabs.
- **XP Formula**:
  - Base XP: `durationMinutes * READING_XP_PER_MINUTE` (default: 2 XP/min).
  - Multipliers: On weekends (UTC Saturday/Sunday), the "Hot Weekend" event activates, multiplying XP awards by `READING_XP_WEEKEND_MULTIPLIER` (default: 2x).
- **Level Calculation**: Level increases progressively according to `level * 20` XP requirements per tier. Level and accumulated XP are strictly monotonic (they never decrease).

---

## Volume Completion vs. Reading Progress

- **Completion Trigger**: A volume is marked as completed automatically when reaching the final page index, or manually by the user.
- **Progress Tracking**: `MangaProgress` tracks the active reading cursor (`page`, `volumeId`, `updatedAt`).
- **Resetting Volume Reading**:
  - When a user resets volume progress to page 1 to re-read, the volume completion is deactivated, but `timesCompleted` is preserved.
  - The read pages are safely accumulated into `historicalPagesRead` in `MangaProgress`, ensuring lifetime reading statistics (total pages read) never decrease.

---

## Book Reading Progress

- **Isolation**: Book reading progress is isolated per user and book (`userId:bookId`).
- **Progress State**: Records CFI locator, spine index, section href, progress percentage (0–100%), current estimated page, and total book pages.
- **Downgrade Protection**: The stored `totalPages` of an entire book cannot be overwritten or downgraded by transient chapter page counts emitted during EPUB section loads.
