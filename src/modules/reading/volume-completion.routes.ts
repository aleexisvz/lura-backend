import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/http/auth.js";
import { VolumeCompletionRepository } from "./volume-completion.repository.js";
import { VolumeCompletionService } from "./volume-completion.service.js";
import { VolumeCompletionController } from "./volume-completion.controller.js";
import { MangaRepository } from "../manga/manga.repository.js";

export async function volumeCompletionRoutes(app: FastifyInstance) {
    const repo = new VolumeCompletionRepository();
    const mangaRepo = new MangaRepository();
    const service = new VolumeCompletionService(repo, mangaRepo);
    const controller = new VolumeCompletionController(service);

    app.post(
        "/manga/:mangaId/volumes/:volumeId/complete",
        { preHandler: requireAuth },
        controller.markCompleted
    );

    app.get(
        "/manga/:mangaId/volumes/:volumeId/complete",
        { preHandler: requireAuth },
        controller.checkCompleted
    );

    app.delete(
        "/manga/:mangaId/volumes/:volumeId/complete",
        { preHandler: requireAuth },
        controller.resetCompletion
    );
}
