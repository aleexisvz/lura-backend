# Lura Backend

API REST para autenticacion, gestion de manga y streaming de paginas.

El proyecto usa Fastify + Prisma + PostgreSQL, JWT para auth y almacenamiento local para archivos de paginas.

## Estado actual

- Rutas activas en la app: `/auth`, `/manga`
- Modulos presentes en `src/modules` pero no registrados en `src/app.ts`: `book`, `collections`, `reading`

## Stack tecnico

- Node.js + TypeScript (ESM)
- Fastify
- Prisma ORM + PostgreSQL
- JWT (`@fastify/jwt`)
- Subida de archivos multipart (`@fastify/multipart`)
- CORS (`@fastify/cors`)

## Requisitos

- Node.js 20+
- PostgreSQL disponible
- npm

## Variables de entorno

Crear un archivo `.env` en la raiz:

```env
NODE_ENV=development
PORT=3001

DATABASE_URL=postgresql://usuario:password@localhost:5432/lura

JWT_SECRET=tu_secreto_super_seguro
JWT_EXPIRES_IN=15m
```

Notas:

- `DATABASE_URL` es obligatoria para Prisma y runtime.
- `JWT_SECRET` debe tener minimo 10 caracteres.

## Instalacion y arranque

1. Instalar dependencias:

```bash
npm install
```

2. Generar cliente Prisma:

```bash
npm run prisma:generate
```

3. Ejecutar migraciones:

```bash
npm run prisma:migrate
```

4. Levantar en desarrollo:

```bash
npm run dev
```

Servidor por defecto: `http://localhost:3001`

## Scripts disponibles

- `npm run dev`: inicia el servidor con hot reload (`tsx watch src/server.ts`)
- `npm run build`: compila TypeScript
- `npm run start`: ejecuta build compilado (`dist/server.js`)
- `npm run prisma:generate`: genera Prisma Client
- `npm run prisma:migrate`: corre migraciones en modo dev

## Arquitectura

Patron por modulo:

- `routes` define endpoints y middlewares
- `controller` parsea request/response
- `service` aplica logica de negocio
- `repository` accede a base de datos con Prisma

Infraestructura:

- `src/infrastructure/database/prisma.ts`: cliente Prisma con adapter `@prisma/adapter-pg`
- `src/infrastructure/storage/LocalStorageService.ts`: utilidades para guardar, mover y leer archivos locales

## Autenticacion y autorizacion

Auth JWT:

- Login/registro devuelven token JWT
- Endpoints protegidos requieren header:

```http
Authorization: Bearer <token>
```

Roles:

- `USER`
- `ADMIN`

Los endpoints de escritura en manga usan `requireAdmin`.

Para probar endpoints admin en local, puedes promover un usuario en DB:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'tu@email.com';
```

## API

Base URL local: `http://localhost:3001`

### Auth

#### POST `/auth/register`

Body:

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

Respuesta esperada:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "clx...",
    "email": "user@example.com"
  }
}
```

#### POST `/auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "123456"
}
```

Respuesta esperada:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "clx...",
    "email": "user@example.com"
  }
}
```

### Manga

#### GET `/manga/` (auth)

- Lista mangas (ordenados por `createdAt desc`)

#### GET `/manga/:mangaId` (auth)

- Devuelve un manga por id
- Si no existe: `404` con `{ "message": "Manga not found" }`

#### GET `/manga/:mangaId/volumes` (auth)

- Lista volumenes de un manga (orden ascendente por `number`)

#### POST `/manga/` (admin)

Body:

```json
{
  "title": "One Piece",
  "author": "Eiichiro Oda"
}
```

#### POST `/manga/:mangaId/volumes` (admin)

Body:

```json
{
  "number": 1,
  "title": "Romance Dawn"
}
```

#### POST `/manga/:mangaId/volumes/:volumeId/upload` (admin)

- `multipart/form-data`
- Acepta 1..N archivos en cualquier campo tipo file
- Ordena archivos por nombre original (orden natural)
- Renombra internamente a `001.jpeg`, `002.jpeg`, etc

Ejemplo con curl:

```bash
curl -X POST "http://localhost:3001/manga/<mangaId>/volumes/<volumeId>/upload" \
  -H "Authorization: Bearer <token_admin>" \
  -F "pages=@./001.jpg" \
  -F "pages=@./002.jpg" \
  -F "pages=@./003.jpg"
```

Respuesta esperada:

```json
{
  "uploaded": 3
}
```

#### GET `/manga/:mangaId/volumes/:volumeId/pages` (auth)

Respuesta esperada:

```json
{
  "volume": {
    "id": "clx...",
    "number": 1,
    "title": "Romance Dawn",
    "pagesCount": 3,
    "status": "READY"
  },
  "pages": [
    {
      "index": 1,
      "imageUrl": "/manga/<mangaId>/volumes/<volumeId>/pages/1/image"
    }
  ]
}
```

#### GET `/manga/:mangaId/volumes/:volumeId/pages/:pageNumber/image` (auth)

- Stream de imagen (`Content-Type: image/jpeg`)

## Almacenamiento de archivos

Durante la subida:

- Temporal: `storage/temp/<uploadSession>/...`

Despues de procesar:

- Final: `storage/manga/<mangaId>/volumes/<volumeId>/pages/<NNN>.jpeg`

## Esquema de datos (Prisma)

Modelos principales:

- `User` (con `role: USER | ADMIN`)
- `Manga`
- `Volume` (con `status: UPLOADING | READY`)
- `Page`
- `MangaProgress`
- `ReadingSession`

Archivo: `prisma/schema.prisma`

## Errores de dominio comunes

Actualmente se lanzan errores por `Error("...")` con codigos como:

- `EMAIL_ALREADY_IN_USE`
- `INVALID_CREDENTIALS`
- `ADMIN_ONLY`
- `NO_FILES_UPLOADED`
- `VOLUME_NOT_FOUND`
- `PAGE_NOT_FOUND`
- `PAGE_FILE_NOT_FOUND`

Si necesitas respuestas de error estandarizadas por codigo HTTP + payload fijo, puedes agregar un `setErrorHandler` global en Fastify.

## Estructura resumida

```text
src/
  app.ts
  server.ts
  config/
  infrastructure/
  modules/
    auth/
    manga/
    book/
    collections/
    reading/
  shared/
prisma/
storage/
```

## Roadmap sugerido

- Registrar en `src/app.ts` los modulos `book`, `collections` y `reading` cuando esten listos
- Estandarizar manejo de errores con una capa `AppError`
- Agregar tests (actualmente el script `test` es placeholder)