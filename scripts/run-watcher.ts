import { MangaDexClient } from "../src/modules/ingestion/mangadex.client.js";
import { IngestionRepository } from "../src/modules/ingestion/ingestion.repository.js";
import { IngestionService } from "../src/modules/ingestion/ingestion.service.js";
import { CloudStorageService } from "../src/infrastructure/storage/CloudStorageService.js";
import { WatcherService } from "../src/modules/ingestion/watcher.service.js";

async function main() {
  console.log("\n======================================================");
  console.log("  Lura Ingestion Watcher (Checking for Spanish Patches)");
  console.log("======================================================\n");

  const mangadex = new MangaDexClient();
  const repo = new IngestionRepository();
  const storage = new CloudStorageService();
  const ingestionService = new IngestionService(mangadex, repo, storage);
  const watcherService = new WatcherService(mangadex, repo, ingestionService);

  try {
    const result = await watcherService.checkAndPatch();
    console.log("\n--- Resultado de la ejecución ---");
    console.log(`Mangas revisados: ${result.checkedTrackers}`);
    console.log(`Tomos actualizados a Español: ${result.patchedVolumes.length}`);
    if (result.patchedVolumes.length > 0) {
      console.table(
        result.patchedVolumes.map((pv) => ({
          "Manga": pv.mangaTitle,
          "Tomo": `Tomo ${pv.volumeNumber}`,
          "Estado": "✅ Actualizado a Español y CDN cache refrescado",
        }))
      );
    }
    console.log("\n======================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error ejecutando Watcher:", err);
    process.exit(1);
  }
}

main();
