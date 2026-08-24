import type {
  MangaDexMangaData,
  MangaDexAggregateResponse,
  MangaDexChapterData,
  MangaDexAtHomeResponse,
} from "./ingestion.types.js";

export class MangaDexClient {
  private baseUrl = "https://api.mangadex.org";
  private lastRequestTime = 0;
  private minIntervalMs = 250; // Max ~4 requests/second to stay well within MangaDex's 5 req/s limit

  /**
   * Helper: Extracts Manga UUID from a URL or raw UUID string
   */
  static extractMangaId(input: string): string {
    const trimmed = input.trim();
    // Match URL pattern: https://mangadex.org/title/uuid/...
    const urlMatch = trimmed.match(/mangadex\.org\/title\/([0-9a-fA-F-]{36})/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }
    // Match raw UUID
    const uuidMatch = trimmed.match(/^[0-9a-fA-F-]{36}$/);
    if (uuidMatch) {
      return uuidMatch[0];
    }
    throw new Error(`Identificador o URL de MangaDex inválido: "${input}"`);
  }

  /**
   * Rate-limited fetch with automatic retry on HTTP 429
   */
  private async rateLimitedFetch(url: string, options?: RequestInit, retries = 3): Promise<Response> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "Lura-Reader/1.0 (Autonomous ETL Ingestor)",
          ...(options?.headers || {}),
        },
      });

      if (response.status === 429 && retries > 0) {
        const retryAfter = Number(response.headers.get("Retry-After")) || 2;
        console.warn(`[MangaDex RateLimit] 429 Too Many Requests. Esperando ${retryAfter}s antes de reintentar...`);
        await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
        return this.rateLimitedFetch(url, options, retries - 1);
      }

      return response;
    } catch (err) {
      if (retries > 0) {
        console.warn(`[MangaDex Network Error] Reintentando tras error: ${(err as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return this.rateLimitedFetch(url, options, retries - 1);
      }
      throw err;
    }
  }

  /**
   * Fetches manga metadata including covers, authors and artists
   */
  async getManga(mangaId: string): Promise<MangaDexMangaData> {
    const url = `${this.baseUrl}/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
    const res = await this.rateLimitedFetch(url);
    if (!res.ok) {
      throw new Error(`Error obteniendo metadata de MangaDex (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return json.data as MangaDexMangaData;
  }

  /**
   * Fetches the canonical aggregate volume-to-chapter structure for a given language
   */
  async getAggregate(mangaId: string, translatedLanguage = "en"): Promise<MangaDexAggregateResponse> {
    const url = `${this.baseUrl}/manga/${mangaId}/aggregate?translatedLanguage[]=${translatedLanguage}`;
    const res = await this.rateLimitedFetch(url);
    if (!res.ok) {
      throw new Error(`Error obteniendo aggregate de MangaDex (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as MangaDexAggregateResponse;
  }

  /**
   * Fetches all available chapters for the manga in specified languages (with automatic pagination)
   */
  async getChapters(mangaId: string, languages: string[] = ["es", "es-la", "en"]): Promise<MangaDexChapterData[]> {
    const limit = 500;
    let offset = 0;
    let total = 0;
    const allChapters: MangaDexChapterData[] = [];

    const langParams = languages.map((l) => `translatedLanguage[]=${encodeURIComponent(l)}`).join("&");

    do {
      const url = `${this.baseUrl}/manga/${mangaId}/feed?${langParams}&limit=${limit}&offset=${offset}&order[chapter]=asc&includeExternalUrl=0&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const res = await this.rateLimitedFetch(url);
      if (!res.ok) {
        throw new Error(`Error obteniendo capítulos de MangaDex (${res.status}): ${await res.text()}`);
      }
      const json = await res.json();
      allChapters.push(...(json.data as MangaDexChapterData[]));
      total = json.total || 0;
      offset += limit;
    } while (offset < total);

    return allChapters;
  }

  /**
   * Obtains image server URL and page hashes for a specific chapter from MangaDex@Home
   */
  async getAtHomeServer(chapterId: string): Promise<MangaDexAtHomeResponse> {
    const url = `${this.baseUrl}/at-home/server/${chapterId}`;
    const res = await this.rateLimitedFetch(url);
    if (!res.ok) {
      throw new Error(`Error obteniendo servidor At-Home para capítulo ${chapterId} (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as MangaDexAtHomeResponse;
  }

  /**
   * Downloads a single image buffer from a CDN URL
   */
  async downloadImageBuffer(url: string, retries = 3): Promise<Buffer> {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Lura-Reader/1.0",
        },
      });

      if (!res.ok) {
        throw new Error(`Fallo descargando imagen (${res.status}) desde ${url}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.downloadImageBuffer(url, retries - 1);
      }
      throw err;
    }
  }

  /**
   * Global feed query for The Watcher: gets newly published Spanish chapters across MangaDex
   */
  async getRecentSpanishChapters(sinceDate: Date): Promise<MangaDexChapterData[]> {
    const isoString = sinceDate.toISOString().replace(/\.\d{3}Z$/, "");
    const url = `${this.baseUrl}/chapter?translatedLanguage[]=es&translatedLanguage[]=es-la&createdAt[since]=${encodeURIComponent(isoString)}&limit=100&order[createdAt]=desc&includes[]=manga`;
    const res = await this.rateLimitedFetch(url);
    if (!res.ok) {
      throw new Error(`Error en Watcher consultando capítulos recientes (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return (json.data || []) as MangaDexChapterData[];
  }

  /**
   * Auto-Publisher search query: discovers top-rated or most popular completed mangas
   */
  async searchDiscoverableMangas(options?: {
    status?: "completed" | "ongoing";
    orderBy?: "rating" | "followedCount" | "createdAt" | "latestUploadedChapter";
    limit?: number;
  }): Promise<MangaDexMangaData[]> {
    const status = options?.status ?? "completed";
    const orderBy = options?.orderBy ?? "followedCount";
    const limit = options?.limit ?? 20;

    const url = `${this.baseUrl}/manga?status[]=${status}&order[${orderBy}]=desc&contentRating[]=safe&contentRating[]=suggestive&hasAvailableChapters=true&availableTranslatedLanguage[]=es&availableTranslatedLanguage[]=es-la&availableTranslatedLanguage[]=en&limit=${limit}&includes[]=cover_art&includes[]=author&includes[]=artist`;

    const res = await this.rateLimitedFetch(url);
    if (!res.ok) {
      throw new Error(`Error buscando mangas descubribles en MangaDex (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return (json.data || []) as MangaDexMangaData[];
  }

  /**
   * Searches MangaDex by title and returns the closest match
   */
  async searchMangaByTitle(title: string): Promise<MangaDexMangaData | null> {
    const url = `${this.baseUrl}/manga?title=${encodeURIComponent(title.trim())}&limit=5&includes[]=cover_art&includes[]=author&includes[]=artist`;
    const res = await this.rateLimitedFetch(url);
    if (!res.ok) {
      throw new Error(`Error buscando manga por título en MangaDex (${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    const list = (json.data || []) as MangaDexMangaData[];
    if (list.length === 0) return null;
    return list[0] ?? null;
  }
}
