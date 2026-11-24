import { describe, expect, it } from "vitest";
import { createErrorTracker } from "../../src/shared/observability/error-tracking.js";

describe("createErrorTracker (unit)", () => {
  it("does nothing and never fails without a DSN", async () => {
    const tracker = createErrorTracker(undefined, "test");

    expect(() => tracker.captureException(new Error("ignored"), { request_id: "req-1" })).not.toThrow();
    await expect(tracker.flush(100)).resolves.toBe(true);
  });
});
