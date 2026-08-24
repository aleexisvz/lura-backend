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

    const rawVolumePlans: VolumePlan[] = [];
    const candidatePendingSpanishVols: number[] = [];
    const coveredChapters = new Set<string>();

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
            coveredChapters.add(chNum);
            return {
              id: ch.id,
              chapterNumber: chNum,
              title: ch.attributes.title,
              language: ch.attributes.translatedLanguage,
              pagesCount: ch.attributes.pages || 0,
            };
          });

          rawVolumePlans.push({
            volumeNumber: volNum,
            volumeTitle: `Tomo ${volNum}`,
            language: "ES",
            isFallback: false,
            chapters,
          });
        } else {
          // Check English fallback chapters
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
            for (const c of enChapters) coveredChapters.add(c.chapterNumber);
            rawVolumePlans.push({
              volumeNumber: volNum,
              volumeTitle: `Tomo ${volNum}`,
              language: "EN",
              isFallback: true,
              chapters: enChapters,
            });
            candidatePendingSpanishVols.push(volNum);
          } else {
            // If English is not available either, take whatever Spanish chapters exist
            const partialEsChapters: ChapterPlan[] = [];
            for (const chNum of requiredChapters) {
              const ch = esChaptersMap.get(chNum);
              if (ch) {
                partialEsChapters.push({
                  id: ch.id,
                  chapterNumber: chNum,
                  title: ch.attributes.title,
                  language: ch.attributes.translatedLanguage,
                  pagesCount: ch.attributes.pages || 0,
                });
              }
            }

            if (partialEsChapters.length > 0) {
              for (const c of partialEsChapters) coveredChapters.add(c.chapterNumber);
              rawVolumePlans.push({
                volumeNumber: volNum,
                volumeTitle: `Tomo ${volNum}`,
                language: "ES",
                isFallback: false,
                chapters: partialEsChapters,
              });
              if (partialEsChapters.length < requiredChapters.length) {
                candidatePendingSpanishVols.push(volNum);
              }
            }
          }
        }
      }
    }

    // Process any unassigned chapters (from volume "none" or extras)
    const allUniqueChapters = Array.from(
      new Set([...esChaptersMap.keys(), ...enChaptersMap.keys()])
    )
      .filter((chNum) => !coveredChapters.has(chNum))
      .sort((a, b) => Number(a) - Number(b));

    if (allUniqueChapters.length > 0) {
      const firstUnassignedNum = Number(allUniqueChapters[0]);
      let canProcessUnassigned = false;

      let nextVolNum = 1;
      if (rawVolumePlans.length > 0) {
        const lastVol = rawVolumePlans[rawVolumePlans.length - 1];
        if (lastVol) {
          nextVolNum = lastVol.volumeNumber + 1;
        }
        const lastCoveredNum = Math.max(...Array.from(coveredChapters).map(Number).filter((n) => !isNaN(n)), 0);
        // Only allow unassigned chapters if they reasonably follow the last covered chapter (within ~2 chapters)
        if (isNaN(firstUnassignedNum) || firstUnassignedNum <= lastCoveredNum + 2) {
          canProcessUnassigned = true;
        }
      } else {
        // If there are no canonical volumes, only allow if unassigned chapters start from beginning (chapter <= 1)
        if (!isNaN(firstUnassignedNum) && firstUnassignedNum <= 1) {
          canProcessUnassigned = true;
        }
      }

      if (canProcessUnassigned) {
        const CHUNK_SIZE = 8;
        for (let i = 0; i < allUniqueChapters.length; i += CHUNK_SIZE) {
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

            rawVolumePlans.push({
              volumeNumber: nextVolNum,
              volumeTitle: `Tomo ${nextVolNum}`,
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
              rawVolumePlans.push({
                volumeNumber: nextVolNum,
                volumeTitle: `Tomo ${nextVolNum}`,
                language: "EN",
                isFallback: true,
                chapters: enChapters,
              });
              candidatePendingSpanishVols.push(nextVolNum);
            } else {
              const partialEs: ChapterPlan[] = [];
              for (const chNum of chunk) {
                const ch = esChaptersMap.get(chNum);
                if (ch) {
                  partialEs.push({
                    id: ch.id,
                    chapterNumber: chNum,
                    title: ch.attributes.title,
                    language: ch.attributes.translatedLanguage,
                    pagesCount: ch.attributes.pages || 0,
                  });
                }
              }
              if (partialEs.length > 0) {
                rawVolumePlans.push({
                  volumeNumber: nextVolNum,
                  volumeTitle: `Tomo ${nextVolNum}`,
                  language: "ES",
                  isFallback: false,
                  chapters: partialEs,
                });
                if (partialEs.length < chunk.length) {
                  candidatePendingSpanishVols.push(nextVolNum);
                }
              }
            }
          }
          nextVolNum++;
        }
      }
    }

    // Enforce strict contiguous sequence starting from Volume 1
    rawVolumePlans.sort((a, b) => a.volumeNumber - b.volumeNumber);

    const volumePlans: VolumePlan[] = [];
    let expectedVolNum = 1;
    for (const vol of rawVolumePlans) {
      if (vol.volumeNumber === expectedVolNum) {
        volumePlans.push(vol);
        expectedVolNum++;
      } else if (vol.volumeNumber > expectedVolNum) {
        // Gap encountered: stop immediately, discarding non-contiguous future volumes
        break;
      }
    }

    // Filter pending Spanish volumes to only include volumes actually retained in volumePlans
    const pendingSpanishVols = candidatePendingSpanishVols.filter((volNum) =>
      volumePlans.some((vp) => vp.volumeNumber === volNum)
    );

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
