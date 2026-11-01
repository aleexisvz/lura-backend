export type ShutdownDeps = {
  /** Closes the HTTP server: stops accepting connections and waits for in-flight requests. */
  closeServer: () => Promise<unknown>;
  /** Closes database connections. Runs after the server has closed. */
  closeDatabase: () => Promise<unknown>;
  log: {
    info: (message: string) => void;
    error: (err: unknown, message: string) => void;
  };
  /** Exit function, injected so tests do not end the process. */
  exit: (code: number) => void;
  /** Maximum time to wait for in-flight requests before closing anyway. */
  timeoutMs: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runShutdown(signal: string, deps: ShutdownDeps) {
  deps.log.info(`Received ${signal}, shutting down`);

  let exitCode = 0;

  try {
    await withTimeout(
      deps.closeServer(),
      deps.timeoutMs,
      `HTTP server did not close within ${deps.timeoutMs} ms`
    );
  } catch (err) {
    deps.log.error(err, "Error while closing the HTTP server");
    exitCode = 1;
  }

  try {
    await deps.closeDatabase();
  } catch (err) {
    deps.log.error(err, "Error while closing database connections");
    exitCode = 1;
  }

  deps.log.info(`Shutdown complete (exit code ${exitCode})`);
  deps.exit(exitCode);
}

/**
 * Returns a shutdown handler. Repeated signals share the first shutdown,
 * so a second Ctrl+C does not start a second close sequence.
 */
export function createShutdown(deps: ShutdownDeps) {
  let shutdown: Promise<void> | undefined;

  return (signal: string) => {
    shutdown ??= runShutdown(signal, deps);
    return shutdown;
  };
}
