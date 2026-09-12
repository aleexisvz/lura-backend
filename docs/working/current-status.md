# Current Status — Lura Platform

## Implemented Capabilities

### 1. Authentication & Users
- JWT-based authentication with strict rate limiting on `/auth/login` and `/auth/register`.
- Role-based authorization (`ADMIN` and `USER`).
- User profile management with avatar uploads to Cloudflare R2.

### 2. Content Management
- Manga: Multi-volume management, cover image uploads, batch page uploads.
- Books: EPUB uploads, cover image uploads, metadata editing, tag associations.
- Ingestion: Background directory watcher and automatic chapter mapper.

### 3. Media & Storage Delivery
- Cloudflare R2 integration via `@aws-sdk/client-s3` and `@aws-sdk/lib-storage`.
- Global CDN URL generation for all images and binary files.
- Zero server-side image proxying: native browser fetching directly from CDN.

### 4. Reading Tracking & Gamification
- Active reading sessions with automatic closing of stale sessions.
- Gamified XP rewards system with configurable caps and "Hot Weekend" 2x multipliers.
- Unified reading stats combining manga and EPUB reading metrics.
- Volume completion tracking with replay support that preserves historical pages read.
- Isolated book progress store persisting CFI locators, spine indices, and percentage completion.

### 5. Logging & Diagnostics
- Pino logger integrated with Fastify.
- Adaptive request logging in development (one-line method/path/status/duration).
- Centralized error normalization enforcing `{ code, message, details }`.

### 6. Frontend SPA
- React 18 + Vite + TypeScript + TanStack Query.
- Manga reader with 3-page forward and 1-page backward prefetching, hotkeys, and AFK timer.
- Book reader with `epub.js`, dual-page spread layout, theme switcher, TOC drawer, bookmarks, and notes.