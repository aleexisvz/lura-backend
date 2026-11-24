import { describe, expect, it, vi } from "vitest";
import { createFatalErrorHandler } from "../../src/shared/process-errors.js";

describe("createFatalErrorHandler (unit)", () => {
  it("logs the error with its source and exits with code 1", async () => {
    const log = { fatal: vi.fn() };
    const exit = vi.fn();
    const handler = createFatalErrorHandler({ log, exit })("unhandledRejection");
    const error = new Error("boom");

    await handler(error);

    expect(log.fatal).toHaveBeenCalledWith(
      { err: error, source: "unhandledRejection" },
      "Unhandled unhandledRejection, exiting"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("names the source of uncaught exceptions too", async () => {
    const log = { fatal: vi.fn() };
    const exit = vi.fn();

    await createFatalErrorHandler({ log, exit })("uncaughtException")(new Error("sync"));

    expect(log.fatal).toHaveBeenCalledWith(expect.objectContaining({ source: "uncaughtException" }), expect.any(String));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports the error and flushes before exiting", async () => {
    const calls: string[] = [];
    const error = new Error("reported");
    const handler = createFatalErrorHandler({
      log: { fatal: () => calls.push("log") },
      capture: (received) => calls.push(received === error ? "capture" : "other"),
      flush: async () => {
        calls.push("flush");
        return true;
      },
      exit: (code) => calls.push(`exit:${code}`),
    })("uncaughtException");

    await handler(error);

    expect(calls).toEqual(["log", "capture", "flush", "exit:1"]);
  });

  it("still exits when flushing the error tracker fails", async () => {
    const exit = vi.fn();
    const handler = createFatalErrorHandler({
      log: { fatal: vi.fn() },
      flush: () => Promise.reject(new Error("network down")),
      exit,
    })("unhandledRejection");

    await handler(new Error("boom"));

    expect(exit).toHaveBeenCalledWith(1);
  });
});
