import cron from "node-cron";
import { logger } from "../../config/logger.js";
import { ReadingSessionRepository } from "./reading-session.repository.js";

const repo = new ReadingSessionRepository();

export function startReadingSessionCronJobs() {
    // Run every day at 03:00 AM
    const purgeTask = cron.schedule("0 3 * * *", async () => {
        try {
            logger.info("[Cron] Starting reading session purge...");
            const deletedCount = await repo.purgeOldSessions(30);
            logger.info(`[Cron] Purged ${deletedCount} old reading sessions.`);
        } catch (error) {
            logger.error({ err: error }, "[Cron] Failed to purge reading sessions");
        }
    });

    logger.info("[Cron] Reading session purge job scheduled (03:00 AM daily).");
    return purgeTask;
}
