# Lura Frontend Handoff (Superdetallado)

## 1) Objetivo de este archivo

Este documento esta pensado para adjuntarlo en el chat de `lura-frontend` y usarlo como fuente de verdad para:

- crear el proyecto frontend desde cero;
- alinear UX/UI con el contrato real del backend actual;
- evitar suposiciones que rompan integracion (auth, errores, roles, uploads, etc.).

---

## 2) Snapshot tecnico (estado real al 2026-05-06)

Backend revisado en:

- repo: `lura-backend`
- branch: `main`
- ultimo commit: `762742f` (`feat(book): add EPUB upload functionality; implement uploadEpub method and related routes`)
- working tree: limpio (sin cambios pendientes al momento de este snapshot)

Stack backend:

- Node.js + TypeScript (ESM)
- Fastify
- Prisma + PostgreSQL
- Zod
- JWT
- Multipart upload

Puerto backend:

- `PORT` default: `3001`
- listener: `0.0.0.0`
- base URL local esperada para frontend: `http://localhost:3001`

CORS:

- `origin: true`
- `credentials: true`

JWT:

- bearer token (`Authorization: Bearer <token>`)
- expira por `JWT_EXPIRES_IN` (default `15m`)
- no existe refresh token endpoint actualmente

---

## 3) Vision funcional del frontend (fase inicial)

Construir un frontend web basico pero usable para validar visualmente todo el backend ya implementado:

- autenticacion (`register/login`);
- lectura de manga (listado, detalle, volumenes, paginas, imagen);
- tracking (progress, continue reading, reading sessions, reading stats);
- modulo book basico (listado, detalle, crear, upload EPUB para admin).

No bloquear la salida del frontend por features futuras (colecciones, parser EPUB interno, lector EPUB completo).

---

## 4) Recomendacion de stack frontend (para empezar rapido y bien)

Recomendado:

- framework: React + Vite + TypeScript
- routing: React Router
- data fetching/cache: TanStack Query
- forms: React Hook Form + Zod
- UI base: componentes simples (sin sobre-ingenieria)
- HTTP client: `fetch` o `axios` (cualquiera, pero con wrapper comun)

Principios:

- separar capa API (cliente) de capa UI;
- tipar respuestas del backend (DTOs frontend);
- manejar errores por `code` (no por texto `message`);
- proteger rutas por auth y rol.

---

## 5) Contrato global de errores (obligatorio en frontend)

Todas las respuestas de error deben tratarse con esta forma:

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": null
}
```

Regla UX:

- la logica de interfaz debe reaccionar por `code`;
- `message` se puede mostrar al usuario;
- `details` puede venir `null` o con info adicional (ejemplo: validacion zod).

Codigos relevantes ya usados:

- `UNAUTHORIZED`
- `INVALID_TOKEN`
- `ADMIN_ONLY`
- `INVALID_PARAMS`
- `INVALID_CREDENTIALS`
- `EMAIL_ALREADY_IN_USE`
- `MANGA_NOT_FOUND`
- `BOOK_NOT_FOUND`
- `VOLUME_NOT_FOUND`
- `VOLUME_NUMBER_DUPLICATE`
- `NO_FILES_UPLOADED`
- `PAGE_NOT_FOUND`
- `PAGE_FILE_NOT_FOUND`
- `PAGE_OUT_OF_RANGE`
- `READING_SESSION_NOT_FOUND`
- `READING_SESSION_FORBIDDEN`
- `CONFLICT`
- `NOT_FOUND`
- `INTERNAL_ERROR`

---

## 6) Contrato de auth y session en frontend

### 6.1 Endpoints

- `POST /auth/register`
- `POST /auth/login`

Request body (ambos):

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Validacion backend:

- `email`: formato email valido
- `password`: minimo 6 caracteres

### 6.2 Response esperada

`register` retorna:

```json
{
  "token": "jwt",
  "user": {
    "id": "cuid",
    "email": "user@example.com",
    "role": "USER"
  }
}
```

`login` retorna:

```json
{
  "token": "jwt",
  "user": {
    "id": "cuid",
    "email": "user@example.com"
  }
}
```

Nota importante de consistencia:

- `register` hoy devuelve `role` dentro de `user`.
- `login` hoy no devuelve `role`.
- el JWT si contiene `role`.

Recomendacion frontend:

- fuente de verdad para rol: decodificar JWT (claim `role`);
- no depender de que `user.role` venga siempre.

### 6.3 Claims JWT usadas en backend

- `sub`: userId
- `email`
- `role`: `USER | ADMIN`

### 6.4 Manejo de expiracion

Como no hay refresh token:

- si llega `401` (`UNAUTHORIZED` o `INVALID_TOKEN`), limpiar session local y redirigir a login;
- opcional: banner "Tu sesion expiro".

---

## 7) Matriz de endpoints actuales (contrato real)

Base URL: `http://localhost:3001`

### 7.1 Auth

1. `POST /auth/register`
2. `POST /auth/login`

Sin auth previa. Rate limit mas estricto (`10/min`) a nivel backend.

### 7.2 Manga (USER autenticado, y ADMIN para escritura)

1. `GET /manga` (auth)
2. `GET /manga/:mangaId` (auth)
3. `GET /manga/:mangaId/volumes` (auth)
4. `GET /manga/:mangaId/volumes/:volumeId/pages` (auth)
5. `GET /manga/:mangaId/volumes/:volumeId/pages/:pageNumber/image` (auth, stream imagen)
6. `POST /manga` (admin)
7. `POST /manga/:mangaId/volumes` (admin)
8. `POST /manga/:mangaId/volumes/:volumeId/upload` (admin, multipart multiples imagenes)

#### Shapes utiles para UI (manga)

- `GET /manga` -> array de mangas (`createdAt desc`)
- `GET /manga/:id/volumes` -> array de volumenes (`number asc`)
- `GET /manga/:id/volumes/:volumeId/pages`:

```json
{
  "volume": {
    "id": "volId",
    "number": 1,
    "title": "Volume 1",
    "pagesCount": 25,
    "status": "READY"
  },
  "pages": [
    { "index": 1, "imageUrl": "/manga/:mangaId/volumes/:volumeId/pages/1/image" }
  ]
}
```

Notas:

- `imageUrl` hoy viene relativo; frontend debe prefijar `API_BASE_URL`.
- `status` puede ser `UPLOADING | READY`.
- no se exponen paths internos ni filenames.

### 7.3 Book (nueva base para EPUB)

1. `GET /books` (auth)
2. `GET /books/:bookId` (auth)
3. `POST /books` (admin)
4. `POST /books/:bookId/upload-epub` (admin, multipart)

#### Shape de Book publico

```json
{
  "id": "bookId",
  "title": "Dune",
  "author": "Frank Herbert",
  "description": "Sci-fi classic",
  "createdAt": "2026-05-06T00:00:00.000Z",
  "updatedAt": "2026-05-06T00:00:00.000Z",
  "hasEpub": true
}
```

#### Upload EPUB

- endpoint: `POST /books/:bookId/upload-epub`
- body: multipart, un archivo `.epub`
- validacion backend: MIME `application/epub+zip` o extension `.epub`
- response esperada:

```json
{
  "uploaded": true
}
```

### 7.4 Reading Progress + Continue Reading

1. `GET /manga/:mangaId/progress` (auth)
2. `POST /manga/:mangaId/progress` (auth)
3. `GET /users/me/continue-reading` (auth)

`GET progress`:

- retorna `null` si no existe progreso.

`POST progress` body:

```json
{
  "volumeId": "volId",
  "page": 10
}
```

Reglas de negocio:

- si manga no existe -> `404 MANGA_NOT_FOUND`
- si volumen invalido -> `404 VOLUME_NOT_FOUND`
- si `page` > `pagesCount` -> `422 PAGE_OUT_OF_RANGE`
- no regresa progreso en misma `volume` (si mandas pagina menor o igual, conserva la mayor)
- cambiar de volumen si actualiza

`GET /users/me/continue-reading`:

- array de progresos recientes (max 10, `updatedAt desc`)

### 7.5 Reading Sessions + Stats

1. `POST /reading/sessions/start` (auth)
2. `POST /reading/sessions/:sessionId/end` (auth)
3. `GET /users/me/reading-stats` (auth)

`POST start` body:

```json
{
  "contentType": "MANGA",
  "contentId": "manga-1"
}
```

`contentType`: `MANGA | BOOK`.

Regla clave:

- si ya habia una sesion abierta, backend la cierra automaticamente y crea la nueva.

`POST end`:

- idempotente (si ya estaba cerrada, devuelve la misma).

`GET stats`:

```json
{
  "totalSeconds": 0,
  "mangaSeconds": 0,
  "bookSeconds": 0
}
```

---

## 8) Comportamientos de UI recomendados por codigo de error

- `UNAUTHORIZED` o `INVALID_TOKEN`: logout + redirect login.
- `ADMIN_ONLY`: mostrar "No tenes permisos para esta accion".
- `INVALID_PARAMS`: mostrar errores de formulario.
- `EMAIL_ALREADY_IN_USE`: marcar campo email.
- `INVALID_CREDENTIALS`: mensaje en login sin revelar detalle.
- `MANGA_NOT_FOUND` / `BOOK_NOT_FOUND`: pantalla 404 de recurso.
- `PAGE_OUT_OF_RANGE`: reajustar pagina objetivo o recargar metadata.
- `NO_FILES_UPLOADED`: alert de upload vacio.
- `VOLUME_NUMBER_DUPLICATE`: feedback inmediato en crear volumen.

---

## 9) Flujo de pantallas MVP recomendado

### Publicas

1. Login
2. Register

### Privadas USER

1. Home basica:
   - continue reading
   - stats resumidas
2. Manga list
3. Manga detail:
   - datos manga
   - lista de volumenes
4. Reader manga:
   - render imagen por pagina
   - botones prev/next
   - guardado de progreso
   - arranque/cierre de reading session
5. Books list
6. Book detail basico (incluyendo `hasEpub`)

### Privadas ADMIN

1. Crear manga
2. Crear volumen
3. Upload paginas manga
4. Crear book
5. Upload EPUB

---

## 10) Arquitectura frontend sugerida (estructura carpetas)

```txt
src/
  app/
    router.tsx
    providers.tsx
  core/
    api/
      client.ts
      types.ts
      error.ts
    auth/
      token-store.ts
      jwt.ts
      guards.tsx
    config/
      env.ts
  features/
    auth/
      api.ts
      pages/
    manga/
      api.ts
      pages/
      components/
    reading/
      api.ts
    books/
      api.ts
      pages/
      components/
    admin/
      pages/
  shared/
    ui/
    hooks/
    utils/
```

---

## 11) Contratos TypeScript sugeridos en frontend

```ts
export type ApiError = {
  code: string;
  message: string;
  details: unknown | null;
};

export type AuthUser = {
  id: string;
  email: string;
  role?: "USER" | "ADMIN";
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type Role = "USER" | "ADMIN";

export type MangaVolumePage = {
  index: number;
  imageUrl: string;
};

export type ListVolumePagesResponse = {
  volume: {
    id: string;
    number: number;
    title: string | null;
    pagesCount: number;
    status: "UPLOADING" | "READY";
  };
  pages: MangaVolumePage[];
};
```

---

## 12) Estrategia de integracion HTTP

Recomendacion minima:

1. un `apiClient` central que:
   - inyecte `Authorization` si hay token;
   - parsee JSON en success/error;
   - normalice errores al tipo `ApiError`.
2. utilitario `buildApiUrl(path)` para prefijar `VITE_API_BASE_URL`.
3. helper para assets protegidos:
   - como las imagenes requieren auth, no siempre conviene `<img src=url>` directo;
   - opcion A: usar endpoint con header auth via `fetch` + `blob` + `URL.createObjectURL`;
   - opcion B: probar `<img src>` si se adjunta token por cookie (hoy no aplica por bearer en header).

Conclusion practica:

- para reader manga, usar `fetch` autenticado y renderizar blob URL.

---

## 13) Estados de loading/error por vista (para buen UX)

- listas (`/manga`, `/books`):
  - skeleton en carga
  - empty state claro
  - retry en error
- formularios (`login`, `register`, `create`):
  - disabled mientras `isSubmitting`
  - error por campo si `INVALID_PARAMS`
  - error global si otros codigos
- uploads:
  - progress visual basico (aunque backend no expone porcentaje real de procesamiento)
  - mostrar resultado (`uploaded` true o error code)
- reader:
  - precarga de pagina siguiente (si existe)
  - fallback si imagen falla (reintento)

---

## 14) Riesgos y gaps conocidos (importante para prompt)

1. `register` y `login` no son 100% consistentes en `user.role`.
2. no hay endpoint de refresh token.
3. progress controller no valida body con zod explicitamente (validar fuerte en frontend).
4. documentacion antigua menciona book como scaffold, pero hoy book ya existe.
5. endpoint de imagen devuelve stream protegido por auth: requiere estrategia especial en frontend.

---

## 15) Plan de implementacion frontend por fases (recomendado)

Fase 1:

- bootstrap proyecto, router, layout base, auth store, api client.

Fase 2:

- auth pages (login/register), guards por rol.

Fase 3:

- manga browse + detail + volumes + pages list.

Fase 4:

- manga reader con blobs, progress, continue reading.

Fase 5:

- reading sessions + reading stats en home.

Fase 6:

- books list/detail + admin create + upload epub.

Fase 7:

- pulido UX, manejo errores por `code`, refactor minimo.

---

## 16) Checklist de validacion manual end-to-end

1. Register y login devuelven token util y navega a area privada.
2. USER puede ver mangas y books, pero no puede crear/upload (403 `ADMIN_ONLY`).
3. ADMIN puede crear manga/volumen/book.
4. Upload paginas manga funciona y luego lista paginas con `imageUrl`.
5. Reader puede abrir pagina por pagina y guardar progreso.
6. `continue-reading` muestra avances recientes.
7. start/end session impacta stats.
8. upload epub marca `hasEpub` en book.
9. cualquier 401 expulsa al login.
10. errores de negocio muestran mensaje correcto segun `code`.

---

## 17) Prompt listo para pegar en chat de `lura-frontend`

```md
Quiero que construyas el frontend inicial de Lura (React + TypeScript) consumiendo un backend Fastify ya existente.

Objetivo: tener un MVP funcional para probar visualmente auth, manga reader, progreso, reading sessions, stats y modulo book con upload EPUB para admin.

Contexto tecnico backend:
- Base URL: http://localhost:3001
- Auth: JWT Bearer, role en claim (`USER` o `ADMIN`), expira en ~15m, sin refresh endpoint.
- Error contract obligatorio:
  {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": null
  }
- CORS habilitado con credentials true.

Endpoints disponibles:
- POST /auth/register
- POST /auth/login
- GET /manga
- GET /manga/:mangaId
- GET /manga/:mangaId/volumes
- GET /manga/:mangaId/volumes/:volumeId/pages
- GET /manga/:mangaId/volumes/:volumeId/pages/:pageNumber/image
- POST /manga (admin)
- POST /manga/:mangaId/volumes (admin)
- POST /manga/:mangaId/volumes/:volumeId/upload (admin, multipart imagenes)
- GET /manga/:mangaId/progress
- POST /manga/:mangaId/progress
- GET /users/me/continue-reading
- POST /reading/sessions/start
- POST /reading/sessions/:sessionId/end
- GET /users/me/reading-stats
- GET /books
- GET /books/:bookId
- POST /books (admin)
- POST /books/:bookId/upload-epub (admin, multipart epub)

Requisitos frontend:
1) Crear estructura por features (auth, manga, reading, books, admin).
2) Implementar api client tipado con manejo centralizado de errores por `code`.
3) Implementar guards por auth y por rol (admin).
4) Pantallas minimas:
   - Login/Register
   - Home privada (continue reading + stats)
   - Manga list/detail/volumes/pages
   - Reader manga con prev/next y guardado de progreso
   - Books list/detail
   - Admin panel basico (create manga, create volume, upload paginas, create book, upload epub)
5) Usar TanStack Query para fetching/cache.
6) Validar formularios con Zod.
7) Manejar imagenes protegidas del reader via fetch autenticado + blob URL (no asumir acceso publico).
8) En 401, limpiar sesion y redirigir a login.
9) UI simple pero limpia, responsive basica.

Importante:
- No inventar endpoints nuevos.
- No cambiar el contrato backend.
- Si detectas inconsistencias menores (ej: role en register vs login), resolverlas del lado frontend con una capa adaptadora.

Entregame:
- estructura de carpetas,
- codigo inicial de app,
- cliente API + tipos,
- rutas protegidas,
- primeras pantallas funcionales,
- y pasos para correr localmente.
```

---

## 18) Cierre

Con este archivo, el chat de `lura-frontend` deberia poder construir un MVP coherente sin redescubrir contratos del backend ni romper reglas de dominio.
