# Lura - Domain Rules

## Content Ownership

- Manga, Volume, and Page are global/shared entities.
- Content is admin-managed.
- Users do not own content records.

## Roles

- ADMIN can create manga, create volumes, and upload pages.
- USER consumes content and tracks progress/time.

## Reading Tracking

- Users can save current manga progress.
- Users can start and end reading sessions.
- Reading sessions power reading statistics and continue-reading features.

## API Exposure Rules

- Never return internal filesystem paths.
- `listVolumePages` returns `index` and `imageUrl`.
- Image access is always through API endpoints, not static file exposure.

## Storage Rules

- Local filesystem path shape:
  `storage/manga/{mangaId}/volumes/{volumeId}/pages/{filename}`
- Filenames are internal implementation details and must not appear in public API payloads.
