import { describe, expect, it } from "vitest";

import { assetIds } from "./asset-ids";

describe("assetIds", () => {
  it("lists every media asset once, in document order, nested ones included", () => {
    const config = [
      { type: "p", children: [{ text: "Intro" }] },
      { type: "video", assetId: "ast_video", url: "https://x", children: [{ text: "" }] },
      {
        type: "column_group",
        children: [
          {
            type: "column",
            children: [{ type: "img", assetId: "ast_image", children: [{ text: "" }] }],
          },
        ],
      },
      { type: "img", assetId: "ast_video", children: [{ text: "" }] },
      { type: "file", url: "blob:local", children: [{ text: "" }] },
    ];
    expect(assetIds(config)).toEqual(["ast_video", "ast_image"]);
  });

  it("returns nothing for a config that is not a node list", () => {
    expect(assetIds(null)).toEqual([]);
    expect(assetIds({ assetId: "ast_1" })).toEqual([]);
    expect(assetIds([{ type: "img", assetId: 42, children: [] }])).toEqual([]);
  });
});
