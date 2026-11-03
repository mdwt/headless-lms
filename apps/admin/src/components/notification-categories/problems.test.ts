import { describe, expect, it } from "vitest";

import { listRefusal, problemsByCategory } from "./problems";

class FakeApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

describe("listRefusal", () => {
  it("keeps a 422's problems as the server words them, at the field it names", () => {
    const err = new FakeApiError(422, "refused", [
      {
        path: "body.categories[1].key",
        message: "the key mentions is used by an earlier category",
      },
      { path: "body", message: "the list is refused" },
    ]);
    expect(listRefusal(err)).toEqual({
      problems: [
        { path: "categories[1].key", message: "the key mentions is used by an earlier category" },
        { path: "", message: "the list is refused" },
      ],
    });
  });

  it("names a 400's field in the message", () => {
    const err = new FakeApiError(400, "invalid", [
      { path: "body.categories[2].key", message: "must match the key pattern" },
      { path: "body.categories", message: "must be an array" },
    ]);
    expect(listRefusal(err)).toEqual({
      problems: [
        { path: "categories[2].key", message: "key must match the key pattern" },
        { path: "categories", message: "must be an array" },
      ],
    });
  });

  it("falls back to the message of a refusal with no issues", () => {
    expect(listRefusal(new FakeApiError(422, "refused"))).toEqual({
      problems: [{ path: "", message: "refused" }],
    });
  });

  it("refuses nothing but 400 and 422", () => {
    expect(listRefusal(new FakeApiError(500, "boom"))).toBeNull();
    expect(listRefusal(new Error("boom"))).toBeNull();
    expect(listRefusal(null)).toBeNull();
  });
});

describe("problemsByCategory", () => {
  it("files each problem under the category its path names and keeps the rest general", () => {
    const { general, byIndex } = problemsByCategory([
      {
        path: "categories[0].covers[1].reasons[0]",
        message: "digest does not allow the reason subject",
      },
      { path: "categories[0].channels", message: "the category offers no channel" },
      { path: "categories[3].key", message: "key must match the key pattern" },
      { path: "categories", message: "must be an array" },
      { path: "", message: "the list is refused" },
    ]);
    expect(general).toEqual(["categories: must be an array", "the list is refused"]);
    expect(byIndex.get(0)).toEqual([
      "digest does not allow the reason subject",
      "the category offers no channel",
    ]);
    expect(byIndex.get(3)).toEqual(["key must match the key pattern"]);
  });
});
