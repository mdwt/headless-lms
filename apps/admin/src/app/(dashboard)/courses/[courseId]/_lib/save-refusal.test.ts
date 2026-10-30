import { describe, expect, it } from "vitest";

import { saveRefusal } from "./save-refusal";

class FakeApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

describe("saveRefusal", () => {
  it("carries the conflict message the API gave", () => {
    const message =
      "An activity can only use ready files from the media library. Not available: ast_gone";
    expect(saveRefusal(new FakeApiError(409, message))).toEqual({ refused: message });
  });

  it("leaves every other failure to be thrown", () => {
    expect(saveRefusal(new FakeApiError(500, "boom"))).toBeNull();
    expect(saveRefusal(new Error("boom"))).toBeNull();
    expect(saveRefusal(null)).toBeNull();
  });
});
