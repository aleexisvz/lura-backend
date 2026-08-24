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
  const watcherService = new WatcherService(mangadex, repo, ingestionService, storage);

  try {
    const result = await watcherService.checkAndPatch();
    console.log("\n--- Resultado de la ejecución ---");
    console.log(`Mangas revisados/auditados: ${result.checkedTrackers}`);
    console.log(`Acciones realizadas: ${result.actions.length}`);
    if (result.actions.length > 0) {
      console.table(
        result.actions.map((act) => ({
          "Manga": act.mangaTitle,
          "Tomo": act.volumeNumber ? `Tomo ${act.volumeNumber}` : "-",
          "Tipo de Acción":
            act.type === "DELETED_INVALID_MANGA"
              ? "🗑️ Manga eliminado (no tenía Tomo 1)"
              : act.type === "DELETED_DISCONNECTED_VOLUME"
              ? "🗑️ Tomo no contiguo eliminado"
              : act.type === "NEW_VOLUME"
              ? "📥 Nuevo tomo contiguo descargado"
              : "✅ Tomo actualizado a Español",
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
