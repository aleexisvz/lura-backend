import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { MangaDexClient } from "./mangadex.client.js";
import { IngestionRepository } from "./ingestion.repository.js";
import { IngestionService } from "./ingestion.service.js";
import { CloudStorageService } from "../../infrastructure/storage/CloudStorageService.js";
import { PublisherService } from "./publisher.service.js";
import { WatcherService } from "./watcher.service.js";

/**
 * Initializes the autonomous background cron schedules for Publisher and Watcher
 */
export function initIngestionCrons() {
  const mangadex = new MangaDexClient();
  const repo = new IngestionRepository();
  const storage = new CloudStorageService();
  const ingestionService = new IngestionService(mangadex, repo, storage);
  const publisherService = new PublisherService(mangadex, repo, ingestionService);
  const watcherService = new WatcherService(mangadex, repo, ingestionService, storage);

  logger.info("[Crons] Inicializando crons de Ingesta Autónoma (Publisher & Watcher)...");

  // 1. The Watcher: Runs every 2 hours to check for new Spanish translations
  cron.schedule("0 */2 * * *", async () => {
    try {
      logger.info("[Cron:Watcher] Ejecutando revisión periódica de traducciones...");
      await watcherService.checkAndPatch();
    } catch (err) {
      logger.error({ err }, "[Cron:Watcher] Error en revisión periódica");
    }
  });

  // 2. The Auto-Publisher: Runs every day at 04:00 AM to publish 1 new top completed manga
  cron.schedule("0 4 * * *", async () => {
    try {
      logger.info("[Cron:Publisher] Ejecutando publicación autónoma diaria...");
      await publisherService.publishNext({ count: 1 });
    } catch (err) {
      logger.error({ err }, "[Cron:Publisher] Error en publicación autónoma");
    }
  });

  logger.info("[Crons] ✅ Crons de Publisher (04:00 AM) y Watcher (cada 2h) programados.");
}
