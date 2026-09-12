# Lura — Project Architecture & Vision

## Platform Overview

Lura is a high-performance digital library and reading platform designed for manga (image-based) and books (EPUB-based).

The system integrates content organization, fast CDN-backed media delivery, precise reading position tracking, and a gamified reading experience with XP progression and seasonal multiplier events.

---

## Core Pillars

1. **Unified Multi-Format Library**:
   - Manga: multi-volume series, page-by-page rendering with client preloading.
   - Books: EPUB standard files rendered in-browser with two-page spread simulation, chapter navigation, and CFI locator sync.

2. **Cloudflare R2 Edge Storage**:
   - S3-compatible cloud object storage.
   - High-throughput delivery of images and EPUB binaries directly via CDN edge endpoints.
   - Decoupled from application servers to maximize Fastify API responsiveness.

3. **Gamified Reading Engine**:
   - Session tracking with idle/timeout safety.
   - XP awarded by reading time with event multipliers ("Hot Weekend").
   - Monotonic lifetime stats (cumulative pages read, volumes completed, books completed).

4. **Clean Architecture**:
   - Modular backend strictly separating transport, domain services, and Prisma repositories.
   - React 18 SPA frontend built with TanStack Query and strict TypeScript types.
