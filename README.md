# Lura Backend

API REST para la biblioteca digital Lura: gestión de manga, libros EPUB, sesiones de lectura con gamificación (XP), perfiles de usuario y entrega de archivos multimedia a través de Cloudflare R2.

Desarrollado con Fastify v5, Prisma v7 + PostgreSQL, JWT para autenticación, Cloudflare R2 para almacenamiento de objetos y Pino para logging estructurado y adaptativo.

---

## Módulos y Rutas Principales

| Prefijo / Ruta | Descripción | Acceso |
|---|---|---|
| `/auth` | Registro, login con JWT y promoción de administradores | Público / Admin |
| `/users` | Perfil del usuario autenticado, actualización y avatar | Autenticado |
| `/tags` | Listado y creación de etiquetas (géneros/temáticas) para manga y libros | Autenticado / Admin |
| `/manga` | Catálogo de mangas, volúmenes, páginas, portadas y rankings | Autenticado / Admin |
| `/books` | Catálogo de libros EPUB, subida de archivos, portadas y progreso | Autenticado / Admin |
| `/reading` | Sesiones de lectura, progreso de manga y completitud de volúmenes | Autenticado |
| `/users/me/reading-stats` | Estadísticas unificadas de lectura (manga + libros) y nivel de XP | Autenticado |
| `/users/me/continue-reading` | Elementos actualmente en lectura con última posición | Autenticado |

---

## Stack Técnico

- **Runtime**: Node.js 20+ (ESM)
- **Framework**: Fastify v5
- **Base de Datos**: PostgreSQL + Prisma v7 ORM con `@prisma/adapter-pg`
- **Almacenamiento**: Cloudflare R2 vía `@aws-sdk/client-s3` y `@aws-sdk/lib-storage`
- **Autenticación**: JWT (`@fastify/jwt`) con bcrypt para hashing de contraseñas
- **Validación**: Zod
- **Logging**: Pino con registro adaptativo en desarrollo y JSON estructurado en producción
- **Rate Limiting**: `@fastify/rate-limit`
- **Testing**: Vitest

---

## Requisitos Previos

- Node.js 22+ (el CI usa Node 22)
- pnpm 10 (la versión exacta está fijada en `packageManager` de `package.json`)
- Docker (para la base de datos de pruebas local, ver abajo)
- PostgreSQL disponible (local o en la nube, ej. Neon)
- Cuenta o bucket de Cloudflare R2 (compatible con API S3)

---

## Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto tomando como referencia `.env.example`:

```env
NODE_ENV=development
PORT=3001

# PostgreSQL Database
DATABASE_URL=postgresql://usuario:password@localhost:5432/lura
# Opcional: conexión directa (sin "-pooler" en Neon) para los comandos de Prisma como migrate.
# Si no se define, Prisma usa DATABASE_URL.
# DIRECT_DATABASE_URL=postgresql://usuario:password@localhost:5432/lura
DATABASE_URL_TEST=postgresql://usuario:password@localhost:5432/lura_test

# JWT Authentication
JWT_SECRET=tu_secreto_super_seguro_con_mas_de_10_caracteres
JWT_EXPIRES_IN=15m

# Cloudflare R2 Storage (S3 API)
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY=tu_access_key
S3_SECRET_KEY=tu_secret_key
S3_BUCKET_NAME=lura-storage
S3_PUBLIC_URL=https://pub-<id>.r2.dev

# Reading XP Configuration
READING_XP_PER_MINUTE=2
READING_XP_SESSION_CAP_SECONDS=1800
READING_XP_WEEKEND_MULTIPLIER=2
```

---

## Instalación y Arranque

1. **Instalar dependencias** (el proyecto usa pnpm, ver `packageManager` en `package.json`):

```bash
pnpm install
```

2. **Generar cliente de Prisma**:

```bash
pnpm run prisma:generate
```

3. **Ejecutar migraciones de base de datos**:

```bash
pnpm run prisma:migrate
```

4. **Iniciar servidor en modo desarrollo**:

```bash
pnpm run dev
```

El servidor iniciará por defecto en `http://localhost:3001`.

---

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| `pnpm run dev` | Inicia el servidor con hot-reload (`tsx watch`) |
| `pnpm test` | Ejecuta la suite de pruebas automatizadas con Vitest |
| `pnpm run test:watch` | Ejecuta tests en modo interactivo/watch |
| `pnpm run test:coverage` | Genera reporte de cobertura de código |
| `pnpm run typecheck` | Verifica tipos con TypeScript (`tsc --noEmit`) |
| `pnpm run build` | Compila el código TypeScript a JavaScript (`dist/`) |
| `pnpm start` | Ejecuta la aplicación compilada en producción |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma |
| `pnpm run prisma:migrate` | Aplica migraciones pendientes en la base de datos |

### Pruebas con base de datos local

Los tests usan un Postgres local (`localhost:5432/lura_test`), nunca la base de Neon. Antes de correrlos, levanta la base:

```bash
docker compose up -d
pnpm test
docker compose down
```

`docker-compose.yml` usa la misma imagen y credenciales que el CI. Si quieres usar otra base de pruebas, define `DATABASE_URL_TEST`; debe terminar en `_test`.

---

## Contrato de Errores

Todas las respuestas de error siguen estrictamente el contrato:

```json
{
  "code": "ERROR_CODE",
  "message": "Mensaje legible para el usuario",
  "details": null
}
```

El campo `code` es estable y machine-readable para que las aplicaciones cliente reaccionen de forma determinista (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_PARAMS`, etc.).