# Lura - Backend Architecture

## Structure

src/

config/
infrastructure/
modules/
  auth/
  book/ (scaffold)
  collections/ (scaffold)
  manga/
  reading/
shared/

---

## Pattern

Modular by feature.

Each module contains:

- controller -> HTTP layer
- service -> business logic
- repository -> DB access
- types/domain -> types + rules

---

## Flow

Controller -> Service -> Repository -> Prisma

---

## Storage Pipeline (Manga)

Upload flow:

1. Upload images (multipart)
2. Save to temp folder
3. Normalize filenames
4. Move to final storage
5. Create DB records
6. Mark volume as READY

---

## Image Serving

- Images are served via API (not static)
- Uses streaming
- Uses cache headers

---

## Important Decisions

- No direct filesystem exposure
- URLs are abstracted (image endpoints)
- Backend supports prefetch but does not implement it
