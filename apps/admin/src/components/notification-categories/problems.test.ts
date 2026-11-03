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
  it("keeps a 422's problems as the server words them", () => {
    const problem = "categories[1] (mentions): the key is used by an earlier category";
    expect(
      listRefusal(new FakeApiError(422, problem, [{ path: "body", message: problem }])),
    ).toEqual({ problems: [problem] });
  });

  it("moves a 400's field into the message under its category", () => {
    const err = new FakeApiError(400, "invalid", [
      { path: "body.categories[2].key", message: "must match the key pattern" },
      { path: "body.categories", message: "must be an array" },
    ]);
    expect(listRefusal(err)).toEqual({
      problems: ["categories[2]: key must match the key pattern", "categories: must be an array"],
    });
  });

  it("refuses nothing but 400 and 422", () => {
    expect(listRefusal(new FakeApiError(500, "boom"))).toBeNull();
    expect(listRefusal(new Error("boom"))).toBeNull();
    expect(listRefusal(null)).toBeNull();
  });
});

describe("problemsByCategory", () => {
  it("files each problem under the category it names and keeps the rest general", () => {
    const { general, byIndex } = problemsByCategory([
      "categories[0] (about_you).covers[1]: digest does not allow the reason subject",
      "categories[0] (about_you): the category offers no channel",
      "categories[3]: key must match the key pattern",
      "categories: must be an array",
    ]);
    expect(general).toEqual(["categories: must be an array"]);
    expect(byIndex.get(0)).toEqual([
      "digest does not allow the reason subject",
      "the category offers no channel",
    ]);
    expect(byIndex.get(3)).toEqual(["key must match the key pattern"]);
  });
});
