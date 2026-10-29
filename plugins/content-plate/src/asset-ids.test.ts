import { describe, expect, it } from "vitest";

import { assetIds } from "./asset-ids";

describe("assetIds", () => {
  it("collects asset ids from nested media nodes, once each, in document order", () => {
    const config = [
      { type: "p", children: [{ text: "intro" }] },
      { type: "img", assetId: "ast_1", url: "x", children: [{ text: "" }] },
      {
        type: "column_group",
        children: [
          { type: "column", children: [{ type: "video", assetId: "ast_2", children: [] }] },
          { type: "column", children: [{ type: "img", assetId: "ast_1", children: [] }] },
        ],
      },
    ];
    expect(assetIds(config)).toEqual(["ast_1", "ast_2"]);
  });

  it("ignores media without a host asset and non-node configs", () => {
    expect(assetIds([{ type: "img", url: "https://example.com/a.png", children: [] }])).toEqual([]);
    expect(assetIds(null)).toEqual([]);
    expect(assetIds("nope")).toEqual([]);
  });
});
