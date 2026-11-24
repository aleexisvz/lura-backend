import { describe, expect, it, vi } from "vitest";
import { createFatalErrorHandler } from "../../src/shared/process-errors.js";

describe("createFatalErrorHandler (unit)", () => {
  it("logs the error with its source and exits with code 1", () => {
    const log = { fatal: vi.fn() };
    const exit = vi.fn();
    const handler = createFatalErrorHandler({ log, exit })("unhandledRejection");
    const error = new Error("boom");

    handler(error);

    expect(log.fatal).toHaveBeenCalledWith(
      { err: error, source: "unhandledRejection" },
      "Unhandled unhandledRejection, exiting"
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("names the source of uncaught exceptions too", () => {
    const log = { fatal: vi.fn() };
    const exit = vi.fn();

    createFatalErrorHandler({ log, exit })("uncaughtException")(new Error("sync"));

    expect(log.fatal).toHaveBeenCalledWith(expect.objectContaining({ source: "uncaughtException" }), expect.any(String));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
