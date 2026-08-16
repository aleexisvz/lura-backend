# Lura Backend — Agent Instructions

## Project
Lura is a fullstack digital library and reader for Manga (images) and Books (EPUB).
This repository is the **backend API**.

## Tech Stack
- Node.js + TypeScript (ESM)
- Fastify
- Prisma v7 + @prisma/adapter-pg + PostgreSQL
- Zod (validation)
- Cloudflare R2 (storage via @aws-sdk/client-s3)

## Architecture
- Modular by feature (NOT global layers).
- Each module: `controller → service → repository → Prisma`.
- Keep business logic in **services only**. Controllers are thin route handlers.
- Use the **repository layer** for all DB access. Never call Prisma directly from services.
- Do NOT change folder structure unless explicitly requested.

## Error Handling
- Use `AppError` for all expected errors. Never throw raw `Error` for business logic.
- Error response shape: `{ code, message, details }`.

## Storage (Cloudflare R2)
- All files are stored in Cloudflare R2 via `CloudStorageService`.
- Use `storage.getPublicUrl(key)` to generate public CDN URLs.
- **Never** expose internal storage keys or filesystem paths in API responses.
- **Never** proxy or stream image files through the backend. Return public CDN URLs in DTOs instead.

## API Rules
- `listVolumePages` returns `{ index, imageUrl }` where `imageUrl` is an absolute CDN URL.
- All image fields in DTOs (`coverUrl`, `profileImageUrl`, `imageUrl`) must be absolute public URLs.
- Never return internal filenames, storage keys, or relative paths.

## Domain Rules
- Manga / Volume / Page are global (shared across all users).
- Users do NOT own content. Only ADMIN can upload content.
- Users: read, track progress, accumulate reading time and XP.

## Code Style
- Prefer readability over cleverness.
- Prefer incremental changes over large refactors.
- Avoid premature abstraction and tight coupling between modules.
- Validate all input with Zod schemas.

## Git Workflow
- Write commit messages in **English** using Conventional Commits (`feat:`, `fix:`, `perf:`, `style:`).
- **Do NOT commit until the user explicitly confirms the change works.**
- If a fix requires multiple iterations, keep changes local and squash into a single atomic commit once approved.
- Work on descriptive branches (`feat/name`, `fix/name`). Merge to `main` with fast-forward when complete.

## Before Implementing
Read these docs if they exist:
- `docs/architecture/backend-architecture.md`
- `docs/architecture/domain-rules.md`
- `docs/working/current-status.md`