import { MangaDexClient } from "../src/modules/ingestion/mangadex.client.js";
import { IngestionRepository } from "../src/modules/ingestion/ingestion.repository.js";
import { IngestionService } from "../src/modules/ingestion/ingestion.service.js";
import { CloudStorageService } from "../src/infrastructure/storage/CloudStorageService.js";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isForce = args.includes("--force");
  const nonFlagArgs = args.filter((a) => !a.startsWith("--"));
  const targetArg = nonFlagArgs.join(" ").trim().replace(/^["']|["']$/g, "");

  if (!targetArg) {
    console.log(`
======================================================
  Lura Autonomous Manga Ingestor (ETL + Fallback)
======================================================
Uso:
  npm run ingest:manga <Título_o_URL_o_ID_MangaDex> [--dry-run] [--force]

Ejemplos:
  npm run ingest:manga "Chainsaw Man" -- --dry-run
  npm run ingest:manga "Yamada-kun to Lv999 no Koi wo Suru"
  npm run ingest:manga https://mangadex.org/title/a77742b1-befd-49a4-bff5-1ad4e6b0ef7b
======================================================
`);
    process.exit(1);
  }

  const mangadex = new MangaDexClient();
  const repo = new IngestionRepository();
  const storage = new CloudStorageService();
  const service = new IngestionService(mangadex, repo, storage);

  console.log("\n======================================================");
  console.log("  Iniciando análisis con MangaDex...");
  console.log("======================================================\n");

  try {
    const { summary } = await service.analyze(targetArg);

    console.log(`\n📖 Manga: "${summary.mangaTitle}"`);
    console.log(`👤 Autor: ${summary.author || "Desconocido"}`);
    if (summary.demographic) console.log(`🎯 Demografía: ${summary.demographic}`);
    if (summary.tags.length > 0) console.log(`🏷️ Géneros / Etiquetas: [${summary.tags.join(", ")}]`);
    console.log(`📊 Estado Manga: ${summary.status}`);
    console.log(`🌐 Estado Global de Traducción: ${summary.overallStatus === "COMPLETED" ? "✅ COMPLETO EN ESPAÑOL" : "⚠️ HÍBRIDO (ES + EN Fallback)"}`);
    console.log(`📚 Total de Tomos Detectados: ${summary.totalVolumes}`);
    console.log(`   - En Español: ${summary.spanishVolumesCount}`);
    console.log(`   - En Inglés (Fallback): ${summary.fallbackVolumesCount} ${summary.fallbackVolumeNumbers.length > 0 ? `(Tomos: [${summary.fallbackVolumeNumbers.join(", ")}])` : ""}`);

    if (summary.totalVolumes === 0) {
      console.log(`\n⚠️ ATENCIÓN: No se encontraron volúmenes continuos disponibles comenzando desde el Tomo 1.`);
      console.log(`   Lura requiere que los capítulos/volúmenes estén disponibles desde el inicio (Tomo 1 en adelante).`);
      console.log(`   Ingesta omitida para evitar mangas incompletos o sin tomos iniciales.\n`);
      process.exit(0);
    }

    console.log("\n--- Desglose de Tomos ---");
    console.table(
      summary.volumes.map((v) => ({
        "Tomo": `Tomo ${v.number}`,
        "Idioma": v.language === "ES" ? "🇪🇸 ES" : "🇬🇧 EN",
        "Fallback": v.isFallback ? "⚠️ Sí (EN)" : "✅ No (ES)",
        "Capítulos": v.chapters.join(", "),
        "Páginas Est.": v.totalPagesEstimate,
      }))
    );

    if (isDryRun) {
      console.log("\n[DRY RUN] Finalizado. No se descargaron ni subieron imágenes a R2.\n");
      process.exit(0);
    }

    console.log("\n======================================================");
    console.log("  Iniciando descarga, conversión WebP y subida a R2...");
    console.log("======================================================\n");

    const result = await service.ingest(targetArg, {
      force: isForce,
      onProgress: (p) => {
        if (p.currentVolume && p.totalVolumes) {
          console.log(`>> [${p.currentVolume}/${p.totalVolumes}] ${p.step}`);
        } else {
          console.log(`>> ${p.step}`);
        }
      },
    });

    console.log("\n======================================================");
    console.log(`🎉 ¡Ingesta completada con éxito para "${result.title}"!`);
    console.log(`   - ID en BD: ${result.mangaId}`);
    console.log(`   - Tomos subidos: ${result.totalVolumes}`);
    console.log(`   - Estado: ${result.status}`);
    if (result.pendingSpanishVols.length > 0) {
      console.log(`   - Tomos en seguimiento para The Watcher: [${result.pendingSpanishVols.join(", ")}]`);
    }
    console.log("======================================================\n");
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error en la ingesta: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
