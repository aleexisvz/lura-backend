# Lura — Agent Instructions

## Overview
Lura is a fullstack web application that acts as a **digital library and reader** for:
- Manga (images)
- Books (EPUB, future)

The system is designed as:
- A **centralized content library (admin-managed)**
- Users consume content, track progress, and reading time

---

## Tech Stack

- Node.js
- TypeScript (ESM)
- Fastify
- Prisma v7 + @prisma/adapter-pg
- PostgreSQL
- Zod (validation)

---

## Architecture

- Modular by feature (NOT global layers)
- Each module contains:
  - controller
  - service
  - repository
  - types/domain

Flow:

Controller → Service → Repository → Prisma

---

## Core Principles

- Do NOT change folder structure unless explicitly required
- Prefer incremental changes over large refactors
- Always respect existing architecture
- Keep logic inside services, not controllers
- Use repository layer for DB access
- Avoid tight coupling between modules

---

## Error Handling

- Use `AppError` for all expected errors
- Never throw raw `Error` for business logic
- Error responses must follow:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": null
}
```

---

## Domain Rules

- Manga / Volume / Page are global (shared)
- Users do NOT own content
- Only ADMIN can upload content
- Users:
  - read
  - track progress
  - accumulate reading time

---

## Storage

- Local filesystem storage
- Structure:
  `storage/manga/{mangaId}/volumes/{volumeId}/pages/{filename}`
- NEVER expose filesystem paths in API responses

---

## API Rules

- `listVolumePages` must return:
  - index
  - imageUrl
- NEVER return internal filenames or paths

---

## Performance

- Image endpoints must:
  - stream files
  - include cache headers
- Backend must be ready for frontend prefetching

---

## Testing

- Prefer unit tests for services
- Avoid testing filesystem-heavy logic early
- Focus on deterministic logic first

---

## Before Implementing Anything

Always read:
- `docs/architecture/backend-architecture.md`
- `docs/architecture/domain-rules.md`
- `docs/working/current-status.md`

---

## Development Style

- Keep code clean and explicit
- Prefer readability over cleverness
- Avoid premature abstraction