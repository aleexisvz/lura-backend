import * as Sentry from "@sentry/node";

export type ErrorTracker = {
  /** Sends an unexpected error to Sentry. `tags` must not contain personal data. */
  captureException: (error: unknown, tags?: Record<string, string>) => void;
  /** Waits until queued events are sent, or the timeout passes. Resolves to whether it finished. */
  flush: (timeoutMs: number) => Promise<boolean>;
};

const disabledTracker: ErrorTracker = {
  captureException: () => {},
  flush: async () => true,
};

/**
 * Sentry is optional: without a DSN nothing is sent and the API behaves as before.
 * Tracing is off, so only errors are reported.
 */
export function createErrorTracker(dsn: string | undefined, environment: string): ErrorTracker {
  if (!dsn) {
    return disabledTracker;
  }

  Sentry.init({ dsn, environment, tracesSampleRate: 0 });

  return {
    captureException: (error, tags) => {
      Sentry.captureException(error, tags ? { tags } : undefined);
    },
    flush: (timeoutMs) => Sentry.flush(timeoutMs),
  };
}
