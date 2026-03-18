import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/http/auth.js";
import { ReadingSessionRepository } from "./reading-session.repository.js";
import { ReadingSessionService } from "./reading-session.service.js";
import { ReadingSessionController } from "./reading-session.controller.js";

export async function readingSessionRoutes(app: FastifyInstance) {
    const repo = new ReadingSessionRepository();
    const service = new ReadingSessionService(repo);
    const controller = new ReadingSessionController(service);

    app.post(
        "/reading/sessions/start",
        { preHandler: requireAuth },
        controller.startSession
    );

    app.post(
        "/reading/sessions/:sessionId/end",
        { preHandler: requireAuth },
        controller.endSession
    );

    app.get(
        "/users/me/reading-stats",
        { preHandler: requireAuth },
        controller.getMyStats
    );
}