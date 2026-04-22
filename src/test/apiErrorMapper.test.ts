import { describe, it, expect } from "vitest";

import { ApiError, normalizeError } from "@/shared/api/client";

describe("normalizeError", () => {
  it("prefers detail string from ApiError.data", () => {
    const err = new ApiError(400, "Original message", { detail: "Missing consent" });
    expect(normalizeError(err)).toBe("Missing consent");
  });

  it("joins detail array into a readable message", () => {
    const err = new ApiError(400, "Original message", { detail: ["A", "B"] });
    expect(normalizeError(err)).toBe("A, B");
  });

  it("falls back to ApiError.message when no known fields exist", () => {
    const err = new ApiError(500, "Server crashed", { unexpected: true });
    expect(normalizeError(err)).toBe("Server crashed");
  });
});

