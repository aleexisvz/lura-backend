import type {
  MangaDexMangaData,
  MangaDexAggregateResponse,
  MangaDexChapterData,
  VolumePlan,
  ChapterPlan,
  MangaPlan,
  DryRunSummary,
} from "./ingestion.types.js";

export class ChapterMapper {
  /**
   * Builds the complete Manga Plan with Hybrid Fallback logic
   */
  static buildMangaPlan(
    mangaData: MangaDexMangaData,
    aggregateEn: MangaDexAggregateResponse,
    allChapters: MangaDexChapterData[]
  ): MangaPlan {
    const rawVolumes = aggregateEn.volumes || {};
    const volumeKeys = Object.keys(rawVolumes);

    // Index valid chapters by (Language, ChapterNumber)
    // Filter out chapters with 0 pages (external reader links)
    const validChapters = allChapters.filter((c) => (c.attributes.pages || 0) > 0 && c.attributes.chapter !== null);

    const esChaptersMap = new Map<string, MangaDexChapterData>();
    const enChaptersMap = new Map<string, MangaDexChapterData>();

    for (const ch of validChapters) {
      const chNum = ch.attributes.chapter?.trim();
      if (!chNum) continue;

      const lang = ch.attributes.translatedLanguage;
      if (lang === "es" || lang === "es-la") {
        // If duplicate, prefer higher version or chapter with more pages
        const existing = esChaptersMap.get(chNum);
        if (!existing || (ch.attributes.pages || 0) > (existing.attributes.pages || 0)) {
          esChaptersMap.set(chNum, ch);
        }
      } else if (lang === "en") {
        const existing = enChaptersMap.get(chNum);
        if (!existing || (ch.attributes.pages || 0) > (existing.attributes.pages || 0)) {
          enChaptersMap.set(chNum, ch);
        }
      }
    }

    const volumePlans: VolumePlan[] = [];
    const pendingSpanishVols: number[] = [];

    // Filter volume keys and sort numerically
    const numericVolumeKeys = volumeKeys
      .filter((k) => k !== "none" && !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b));

    if (numericVolumeKeys.length > 0) {
      for (const volKey of numericVolumeKeys) {
        const volNum = Number(volKey);
        const aggVol = rawVolumes[volKey];
        if (!aggVol || !aggVol.chapters) continue;
        const requiredChapters = Object.keys(aggVol.chapters).sort(
          (a, b) => Number(a) - Number(b)
        );

        if (requiredChapters.length === 0) continue;

        // Check if all required chapters exist in Spanish
        const hasAllSpanish = requiredChapters.every((chNum) => esChaptersMap.has(chNum));

        if (hasAllSpanish) {
          const chapters: ChapterPlan[] = requiredChapters.map((chNum) => {
            const ch = esChaptersMap.get(chNum)!;
            return {
              id: ch.id,
              chapterNumber: chNum,
              title: ch.attributes.title,
              language: ch.attributes.translatedLanguage,
              pagesCount: ch.attributes.pages || 0,
            };
          });

          volumePlans.push({
            volumeNumber: volNum,
            volumeTitle: `Tomo ${volNum}`,
            language: "ES",
            isFallback: false,
            chapters,
          });
        } else {
          // Fallback to English
          const enChapters: ChapterPlan[] = [];
          for (const chNum of requiredChapters) {
            const ch = enChaptersMap.get(chNum);
            if (ch) {
              enChapters.push({
                id: ch.id,
                chapterNumber: chNum,
                title: ch.attributes.title,
                language: "en",
                pagesCount: ch.attributes.pages || 0,
              });
            }
          }

          if (enChapters.length > 0) {
            volumePlans.push({
              volumeNumber: volNum,
              volumeTitle: `Tomo ${volNum}`,
              language: "EN",
              isFallback: true,
              chapters: enChapters,
            });
            pendingSpanishVols.push(volNum);
          }
        }
      }
    } else {
      // Fallback if manga has no volume groupings in aggregate ("none" only)
      // Group chapters into synthetic volumes of 8 chapters each
      const allUniqueChapters = Array.from(
        new Set([...esChaptersMap.keys(), ...enChaptersMap.keys()])
      ).sort((a, b) => Number(a) - Number(b));

      const CHUNK_SIZE = 8;
      for (let i = 0; i < allUniqueChapters.length; i += CHUNK_SIZE) {
        const volNum = Math.floor(i / CHUNK_SIZE) + 1;
        const chunk = allUniqueChapters.slice(i, i + CHUNK_SIZE);
        const hasAllSpanish = chunk.every((chNum) => esChaptersMap.has(chNum));

        if (hasAllSpanish) {
          const chapters: ChapterPlan[] = chunk.map((chNum) => {
            const ch = esChaptersMap.get(chNum)!;
            return {
              id: ch.id,
              chapterNumber: chNum,
              title: ch.attributes.title,
              language: ch.attributes.translatedLanguage,
              pagesCount: ch.attributes.pages || 0,
            };
          });

          volumePlans.push({
            volumeNumber: volNum,
            volumeTitle: `Tomo ${volNum}`,
            language: "ES",
            isFallback: false,
            chapters,
          });
        } else {
          const enChapters: ChapterPlan[] = [];
          for (const chNum of chunk) {
            const ch = enChaptersMap.get(chNum);
            if (ch) {
              enChapters.push({
                id: ch.id,
                chapterNumber: chNum,
                title: ch.attributes.title,
                language: "en",
                pagesCount: ch.attributes.pages || 0,
              });
            }
          }

          if (enChapters.length > 0) {
            volumePlans.push({
              volumeNumber: volNum,
              volumeTitle: `Tomo ${volNum}`,
              language: "EN",
              isFallback: true,
              chapters: enChapters,
            });
            pendingSpanishVols.push(volNum);
          }
        }
      }
    }

    // Extract title, description, cover
    const attrs = mangaData.attributes;
    const title =
      attrs.title.es ||
      attrs.title["es-la"] ||
      attrs.title.en ||
      attrs.title.ja ||
      Object.values(attrs.title)[0] ||
      "Sin Título";

    const titleKanji =
      attrs.title["ja-ro"] ||
      attrs.altTitles.find((t) => t.ja)?.ja ||
      null;

    const description =
      attrs.description.es ||
      attrs.description["es-la"] ||
      attrs.description.en ||
      Object.values(attrs.description)[0] ||
      null;

    // Find cover art relationship
    const coverRel = mangaData.relationships.find((r) => r.type === "cover_art");
    const coverFileName = coverRel?.attributes?.fileName || null;

    // Find author relationship
    const authorRel = mangaData.relationships.find(
      (r) => r.type === "author" || r.type === "artist"
    );
    const author = authorRel?.attributes?.name || null;

    const isFullySpanish = pendingSpanishVols.length === 0;

    // Demographic
    const demoRaw = attrs.publicationDemographic;
    const demographic = demoRaw
      ? demoRaw.charAt(0).toUpperCase() + demoRaw.slice(1)
      : null;

    // Tags & Genres extraction
    const tagSet = new Set<string>();
    if (demographic) {
      tagSet.add(demographic);
    }

    if (attrs.tags && Array.isArray(attrs.tags)) {
      for (const t of attrs.tags) {
        const enName = t.attributes?.name?.en?.trim();
        if (enName) {
          const lower = enName.toLowerCase();
          const translated = GENRE_TRANSLATIONS[lower] || enName;
          tagSet.add(translated);
        }
      }
    }

    const tags = Array.from(tagSet);

    return {
      externalId: mangaData.id,
      title,
      titleKanji,
      author,
      description,
      status: attrs.status === "completed" ? "FINALIZADO" : "EN_EMISION",
      coverFileName,
      demographic,
      tags,
      volumes: volumePlans,
      pendingSpanishVols,
      isFullySpanish,
    };
  }

  /**
   * Generates a readable DryRunSummary for CLI and API previews
   */
  static toDryRunSummary(plan: MangaPlan): DryRunSummary {
    const spanishVols = plan.volumes.filter((v) => v.language === "ES");
    const fallbackVols = plan.volumes.filter((v) => v.isFallback);

    return {
      mangaTitle: plan.title,
      externalId: plan.externalId,
      author: plan.author,
      status: plan.status,
      demographic: plan.demographic,
      tags: plan.tags,
      totalVolumes: plan.volumes.length,
      spanishVolumesCount: spanishVols.length,
      fallbackVolumesCount: fallbackVols.length,
      fallbackVolumeNumbers: plan.pendingSpanishVols,
      overallStatus: plan.isFullySpanish ? "COMPLETED" : "HYBRID",
      volumes: plan.volumes.map((v) => ({
        number: v.volumeNumber,
        language: v.language,
        isFallback: v.isFallback,
        chapters: v.chapters.map((c) => `Cap. ${c.chapterNumber}`),
        totalPagesEstimate: v.chapters.reduce((sum, c) => sum + c.pagesCount, 0),
      })),
    };
  }
}

const GENRE_TRANSLATIONS: Record<string, string> = {
  action: "Acción",
  adventure: "Aventura",
  comedy: "Comedia",
  drama: "Drama",
  fantasy: "Fantasía",
  horror: "Terror",
  mystery: "Misterio",
  psychological: "Psicológico",
  romance: "Romance",
  "sci-fi": "Ciencia Ficción",
  "slice of life": "Recuentos de la vida",
  supernatural: "Sobrenatural",
  thriller: "Suspenso",
  demons: "Demonios",
  magic: "Magia",
  "martial arts": "Artes Marciales",
  military: "Militar",
  monsters: "Monstruos",
  music: "Música",
  police: "Policíaco",
  "post-apocalyptic": "Post-Apocalíptico",
  reincarnation: "Reencarnación",
  "school life": "Vida Escolar",
  space: "Espacio",
  sports: "Deportes",
  superheroes: "Superhéroes",
  survival: "Supervivencia",
  "time travel": "Viajes en el tiempo",
  vampires: "Vampiros",
  "video games": "Videojuegos",
  villainess: "Villana",
  zombies: "Zombis",
  isekai: "Isekai",
  gore: "Gore",
  "award winning": "Galardonado",
  "official colored": "A Color",
  crime: "Crimen",
  philosophical: "Filosófico",
  tragedy: "Tragedia",
  historical: "Histórico",
  aliens: "Alienígenas",
  animals: "Animales",
  ghosts: "Fantasmas",
  mafia: "Mafia",
  ninja: "Ninja",
  samurai: "Samurái",
  shounen: "Shounen",
  seinen: "Seinen",
  shoujo: "Shoujo",
  josei: "Josei",
};
