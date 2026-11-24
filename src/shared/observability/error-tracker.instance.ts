import { env } from "../../config/env.js";
import { createErrorTracker } from "./error-tracking.js";

// Shared tracker for the whole process. Disabled when SENTRY_DSN is not set.
export const errorTracker = createErrorTracker(env.SENTRY_DSN, env.NODE_ENV);
