export type FatalErrorDeps = {
  log: { fatal: (object: object, message: string) => void };
  /** Reports the error to the error tracker, if one is configured. */
  capture?: (error: unknown) => void;
  /** Waits for queued error reports, so they are sent before the process exits. */
  flush?: (timeoutMs: number) => Promise<boolean>;
  /** Exit function, injected so tests do not end the process. */
  exit: (code: number) => void;
};

const FLUSH_TIMEOUT_MS = 2_000;

/**
 * Returns a listener for uncaughtException or unhandledRejection. It logs the
 * error with its stack, reports it, and waits briefly for the report to be sent
 * before exiting, so a crash leaves a record in the logs and in the tracker.
 */
export function createFatalErrorHandler(deps: FatalErrorDeps) {
  return (source: "uncaughtException" | "unhandledRejection") => async (error: unknown) => {
    deps.log.fatal({ err: error, source }, `Unhandled ${source}, exiting`);
    deps.capture?.(error);
    await deps.flush?.(FLUSH_TIMEOUT_MS).catch(() => false);
    deps.exit(1);
  };
}
