export type FatalErrorDeps = {
  log: { fatal: (object: object, message: string) => void };
  /** Exit function, injected so tests do not end the process. */
  exit: (code: number) => void;
};

/**
 * Returns a listener for uncaughtException or unhandledRejection. It logs the
 * error with its stack before exiting, so a crash leaves a record in the logs.
 */
export function createFatalErrorHandler(deps: FatalErrorDeps) {
  return (source: "uncaughtException" | "unhandledRejection") => (error: unknown) => {
    deps.log.fatal({ err: error, source }, `Unhandled ${source}, exiting`);
    deps.exit(1);
  };
}
