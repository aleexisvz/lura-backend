import { MangaDexClient } from "../src/modules/ingestion/mangadex.client.js";
import { IngestionRepository } from "../src/modules/ingestion/ingestion.repository.js";
import { IngestionService } from "../src/modules/ingestion/ingestion.service.js";
import { CloudStorageService } from "../src/infrastructure/storage/CloudStorageService.js";
import { PublisherService } from "../src/modules/ingestion/publisher.service.js";

async function main() {
  const args = process.argv.slice(2);
  const isDiscoverOnly = args.includes("--discover-only") || args.includes("-d");

  const countArgIndex = args.findIndex((a) => a === "--count" || a === "-c");
  const count = countArgIndex !== -1 && args[countArgIndex + 1] ? Number(args[countArgIndex + 1]) : 1;

  const orderArgIndex = args.findIndex((a) => a === "--order" || a === "-o");
  const orderRaw = orderArgIndex !== -1 && args[orderArgIndex + 1] ? args[orderArgIndex + 1] : "followed";
  const orderBy = orderRaw === "rating" ? "rating" : orderRaw === "latest" ? "createdAt" : "followedCount";

  console.log("\n======================================================");
  console.log("  Lura Auto-Publisher (Manga Discovery & Ingestion)");
  console.log("======================================================\n");

  const mangadex = new MangaDexClient();
  const repo = new IngestionRepository();
  const storage = new CloudStorageService();
  const ingestionService = new IngestionService(mangadex, repo, storage);
  const publisher = new PublisherService(mangadex, repo, ingestionService);

  try {
    if (isDiscoverOnly) {
      console.log(`🔍 Buscando candidatos en MangaDex (Orden: ${orderBy})...\n`);
      const candidates = await publisher.discoverCandidates({
        orderBy: orderBy as any,
        limit: 30,
      });

      console.log(`📚 Se encontraron ${candidates.length} mangas nuevos listos para publicar:\n`);
      console.table(
        candidates.map((c, i) => ({
          "#": i + 1,
          "Título": c.title,
          "Autor": c.author || "Desconocido",
          "Año": c.year || "-",
          "MangaDex UUID": c.externalId,
        }))
      );

      console.log("\n💡 Para publicar el siguiente manga de la lista, ejecuta:");
      console.log("   npm run ingest:publisher\n");
      console.log("💡 O para publicar los 3 primeros:");
      console.log("   npm run ingest:publisher -- --count 3\n");
      process.exit(0);
    }

    console.log(`🚀 Iniciando publicación automática de los siguientes ${count} manga(s)...\n`);
    const result = await publisher.publishNext({
      count,
      orderBy: orderBy as any,
      onProgress: (p) => {
        if (p.currentVolume && p.totalVolumes) {
          console.log(`>> [${p.currentVolume}/${p.totalVolumes}] ${p.step}`);
        } else {
          console.log(`>> ${p.step}`);
        }
      },
    });

    console.log("\n======================================================");
    console.log(`🎉 Publicación automática completada: ${result.publishedCount} manga(s) subidos.`);
    if (result.published.length > 0) {
      console.table(
        result.published.map((p) => ({
          "Título": p.title,
          "Tomos": p.totalVolumes,
          "Estado Ingesta": p.status,
          "ID Lura": p.mangaId,
        }))
      );
    }
    console.log(`📋 Candidatos restantes en cola: ${result.remainingCandidates}`);
    console.log("======================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error en Auto-Publisher:", (err as Error).message);
    process.exit(1);
  }
}

main();
