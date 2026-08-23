import { MangaDexClient } from "../src/modules/ingestion/mangadex.client.js";
import { IngestionRepository } from "../src/modules/ingestion/ingestion.repository.js";
import { IngestionService } from "../src/modules/ingestion/ingestion.service.js";
import { CloudStorageService } from "../src/infrastructure/storage/CloudStorageService.js";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const targetArg = args.find((a) => !a.startsWith("--"));

  if (!targetArg) {
    console.log(`
======================================================
  Lura Autonomous Manga Ingestor (ETL + Fallback)
======================================================
Uso:
  npm run ingest:manga <URL_o_ID_MangaDex> [--dry-run]

Ejemplos:
  npm run ingest:manga https://mangadex.org/title/a1c7c817-4e59-42b5-bd26-5214772f3f71 -- --dry-run
  npm run ingest:manga a1c7c817-4e59-42b5-bd26-5214772f3f71
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
    console.log(`📊 Estado Manga: ${summary.status}`);
    console.log(`🌐 Estado Global de Traducción: ${summary.overallStatus === "COMPLETED" ? "✅ COMPLETO EN ESPAÑOL" : "⚠️ HÍBRIDO (ES + EN Fallback)"}`);
    console.log(`📚 Total de Tomos Detectados: ${summary.totalVolumes}`);
    console.log(`   - En Español: ${summary.spanishVolumesCount}`);
    console.log(`   - En Inglés (Fallback): ${summary.fallbackVolumesCount} ${summary.fallbackVolumeNumbers.length > 0 ? `(Tomos: [${summary.fallbackVolumeNumbers.join(", ")}])` : ""}`);

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
