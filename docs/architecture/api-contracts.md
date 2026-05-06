# Lura - API Contracts

## Manga

GET /manga  
GET /manga/:mangaId  
GET /manga/:mangaId/volumes

---

## Pages

GET /manga/:mangaId/volumes/:volumeId/pages

Response:

```json
{
  "volume": {},
  "pages": [
    { "index": 1, "imageUrl": "..." }
  ]
}
```

---

## Image

GET /manga/:mangaId/volumes/:volumeId/pages/:pageNumber/image

Headers:

- Content-Type
- Content-Length
- Cache-Control
- Last-Modified

---

## Progress

GET /manga/:mangaId/progress  
POST /manga/:mangaId/progress

---

## Reading Sessions

POST /reading/sessions/start  
POST /reading/sessions/:sessionId/end  
GET /users/me/reading-stats

---

## Error Contract (Standard)

All error responses must follow this JSON shape:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": null
}
```

Notes:

- `code` is stable and machine-readable (frontend/business handling should key off this field).
- `message` is human-readable.
- `details` is optional context and defaults to `null` when not applicable.

---

## Error Examples

### 401 Unauthorized

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required",
  "details": null
}
```

### 404 Not Found

```json
{
  "code": "NOT_FOUND",
  "message": "Manga not found",
  "details": null
}
```

Or domain-specific not found:

```json
{
  "code": "MANGA_NOT_FOUND",
  "message": "Manga not found",
  "details": null
}
```

### 422 Unprocessable Entity

```json
{
  "code": "PAGE_OUT_OF_RANGE",
  "message": "Page 11 exceeds volume page count (10)",
  "details": null
}
```

### 500 Internal Server Error

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Internal server error",
  "details": null
}
```
