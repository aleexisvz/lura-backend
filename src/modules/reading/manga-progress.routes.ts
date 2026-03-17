import type { FastifyInstance } from "fastify"
import { MangaProgressRepository } from "./manga-progress.repository.js"
import { MangaProgressService } from "./manga-progress.service.js"
import { MangaProgressController } from "./manga-progress.controller.js"
import { requireAuth } from "../../shared/http/auth.js"

export async function mangaProgressRoutes(app: FastifyInstance) {

    const repo = new MangaProgressRepository()
    const service = new MangaProgressService(repo)
    const controller = new MangaProgressController(service)

    app.get(
        "/manga/:mangaId/progress",
        { preHandler: requireAuth },
        controller.getProgress
    )

    app.post(
        "/manga/:mangaId/progress",
        { preHandler: requireAuth },
        controller.updateProgress
    )

    app.get(
        "/users/me/continue-reading",
        { preHandler: requireAuth },
        controller.continueReading
    )
}