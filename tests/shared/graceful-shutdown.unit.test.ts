import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "../../src/shared/graceful-shutdown.js";

function fakeDeps(overrides: Partial<Parameters<typeof createShutdown>[0]> = {}) {
  const calls: string[] = [];
  const deps = {
    closeServer: vi.fn(async () => {
      calls.push("closeServer");
    }),
    closeDatabase: vi.fn(async () => {
      calls.push("closeDatabase");
    }),
    log: { info: vi.fn(), error: vi.fn() },
    exit: vi.fn(),
    timeoutMs: 1000,
    ...overrides,
  };
  return { deps, calls };
}

describe("createShutdown (unit)", () => {
  it("closes the server, then the database, then exits with code 0", async () => {
    const { deps, calls } = fakeDeps();

    await createShutdown(deps)("SIGTERM");

    expect(calls).toEqual(["closeServer", "closeDatabase"]);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it("waits for an in-flight request before closing the database", async () => {
    let finishRequest!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    const { deps, calls } = fakeDeps({
      // Stands in for app.close(), which resolves once pending requests complete.
      closeServer: vi.fn(async () => {
        await inFlight;
        calls.push("closeServer");
      }),
    });

    const shutdown = createShutdown(deps);
    const running = shutdown("SIGINT");
    await Promise.resolve();
    expect(deps.closeDatabase).not.toHaveBeenCalled();

    finishRequest();
    await running;
    expect(calls).toEqual(["closeServer", "closeDatabase"]);
  });

  it("still closes the database and exits with code 1 when closing the server fails", async () => {
    const { deps, calls } = fakeDeps({
      closeServer: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await createShutdown(deps)("SIGTERM");

    expect(calls).toEqual(["closeDatabase"]);
    expect(deps.log.error).toHaveBeenCalledWith(expect.any(Error), "Error while closing the HTTP server");
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("exits with code 1 when closing the database fails", async () => {
    const { deps } = fakeDeps({
      closeDatabase: vi.fn(async () => {
        throw new Error("pool busy");
      }),
    });

    await createShutdown(deps)("SIGTERM");

    expect(deps.log.error).toHaveBeenCalledWith(expect.any(Error), "Error while closing database connections");
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("stops waiting after the timeout, closes the database and exits with code 1", async () => {
    const { deps, calls } = fakeDeps({
      timeoutMs: 20,
      closeServer: vi.fn(() => new Promise<void>(() => {})), // never resolves
    });

    await createShutdown(deps)("SIGTERM");

    expect(calls).toEqual(["closeDatabase"]);
    expect(deps.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "HTTP server did not close within 20 ms" }),
      "Error while closing the HTTP server"
    );
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("runs the shutdown only once when signals repeat", async () => {
    const { deps } = fakeDeps();
    const shutdown = createShutdown(deps);

    await Promise.all([shutdown("SIGINT"), shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(deps.closeServer).toHaveBeenCalledTimes(1);
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });
});
