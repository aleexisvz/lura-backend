import { MangaDexClient } from "./mangadex.client.js";
import { IngestionRepository } from "./ingestion.repository.js";
import { IngestionService } from "./ingestion.service.js";

export interface DiscoverableManga {
  externalId: string;
  title: string;
  author: string | null;
  status: string;
  year?: number;
  contentRating: string;
}

export class PublisherService {
  constructor(
    private mangadex: MangaDexClient,
    private repo: IngestionRepository,
    private ingestionService: IngestionService
  ) {}

  /**
   * Discovers top completed mangas from MangaDex that are NOT yet in Lura
   */
  async discoverCandidates(options?: {
    status?: "completed" | "ongoing";
    orderBy?: "rating" | "followedCount" | "createdAt" | "latestUploadedChapter";
    limit?: number;
  }): Promise<DiscoverableManga[]> {
    const rawMangas = await this.mangadex.searchDiscoverableMangas({
      status: options?.status ?? "completed",
      orderBy: options?.orderBy ?? "followedCount",
      limit: options?.limit ?? 30,
    });

    if (rawMangas.length === 0) {
      return [];
    }

    const externalIds = rawMangas.map((m) => m.id);
    const titles = rawMangas.map((m) => {
      const attrs = m.attributes;
      return (
        attrs.title.es ||
        attrs.title["es-la"] ||
        attrs.title.en ||
        Object.values(attrs.title)[0] ||
        ""
      );
    }).filter(Boolean);

    // Deduplicate against database
    const existingIds = await this.repo.findExistingExternalIds(externalIds);
    const existingTitles = await this.repo.findExistingTitles(titles);

    const candidates: DiscoverableManga[] = [];

    for (const m of rawMangas) {
      if (existingIds.has(m.id)) continue;

      const attrs = m.attributes;
      const title =
        attrs.title.es ||
        attrs.title["es-la"] ||
        attrs.title.en ||
        Object.values(attrs.title)[0] ||
        "Sin Título";

      if (existingTitles.has(title.toLowerCase())) continue;

      const authorRel = m.relationships.find(
        (r) => r.type === "author" || r.type === "artist"
      );
      const author = authorRel?.attributes?.name || null;

      candidates.push({
        externalId: m.id,
        title,
        author,
        status: attrs.status,
        year: attrs.year,
        contentRating: attrs.contentRating,
      });
    }

    return candidates;
  }

  /**
   * Automatically ingests the top N discoverable mangas into Lura
   */
  async publishNext(options?: {
    count?: number;
    orderBy?: "rating" | "followedCount" | "createdAt" | "latestUploadedChapter";
    onProgress?: (progress: any) => void;
  }) {
    const count = options?.count ?? 1;
    const notify = options?.onProgress || (() => {});

    notify({ step: `Buscando mangas candidatos en MangaDex...` });
    const candidates = await this.discoverCandidates({
      orderBy: options?.orderBy ?? "followedCount",
      limit: 20,
    });

    if (candidates.length === 0) {
      console.log("[Publisher] No se encontraron mangas nuevos para publicar.");
      return {
        publishedCount: 0,
        published: [],
        remainingCandidates: 0,
      };
    }

    const toPublish = candidates.slice(0, count);
    const results: Array<{
      mangaId: string;
      title: string;
      totalVolumes: number;
      status: string;
    }> = [];

    console.log(
      `[Publisher] Se publicarán ${toPublish.length} manga(s) automáticamente.`
    );

    for (const [index, candidate] of toPublish.entries()) {
      notify({
        step: `[${index + 1}/${toPublish.length}] Publicando "${candidate.title}"...`,
      });

      try {
        const result = await this.ingestionService.ingest(candidate.externalId, {
          onProgress: notify,
        });

        results.push({
          mangaId: result.mangaId,
          title: result.title,
          totalVolumes: result.totalVolumes,
          status: result.status,
        });

        console.log(
          `[Publisher] ✅ "${result.title}" publicado con éxito (${result.totalVolumes} tomos).`
        );
      } catch (err) {
        console.error(
          `[Publisher] ❌ Error publicando "${candidate.title}": ${(err as Error).message}`
        );
      }
    }

    return {
      publishedCount: results.length,
      published: results,
      remainingCandidates: candidates.length - toPublish.length,
    };
  }
}
