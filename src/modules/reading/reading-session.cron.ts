import cron from "node-cron";
import { ReadingSessionRepository } from "./reading-session.repository.js";

const repo = new ReadingSessionRepository();

export function startReadingSessionCronJobs() {
    // Run every day at 03:00 AM
    cron.schedule("0 3 * * *", async () => {
        try {
            console.log("[Cron] Starting reading session purge...");
            const deletedCount = await repo.purgeOldSessions(30);
            console.log(`[Cron] Purged ${deletedCount} old reading sessions.`);
        } catch (error) {
            console.error("[Cron] Failed to purge reading sessions:", error);
        }
    });

    console.log("[Cron] Reading session purge job scheduled (03:00 AM daily).");
}
