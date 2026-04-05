# Lura — API Contracts

## Manga

GET /manga
GET /manga/:mangaId
GET /manga/:mangaId/volumes

---

## Pages

GET /manga/:mangaId/volumes/:volumeId/pages

Response:

{
  "volume": {...},
  "pages": [
    { "index": 1, "imageUrl": "..." }
  ]
}

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