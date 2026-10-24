import { describe, expect, it } from "vitest";

import { withAssetUrls } from "./asset-urls";

describe("withAssetUrls", () => {
  it("gives every node with a served asset that asset's url, nested ones included", () => {
    const config = [
      { type: "video", assetId: "ast_video", url: "https://old/video", children: [{ text: "" }] },
      {
        type: "column_group",
        children: [
          { type: "img", assetId: "ast_image", url: "https://old/image", children: [{ text: "" }] },
        ],
      },
    ];

    expect(
      withAssetUrls(config, { ast_video: "https://new/video", ast_image: "https://new/image" }),
    ).toEqual([
      { type: "video", assetId: "ast_video", url: "https://new/video", children: [{ text: "" }] },
      {
        type: "column_group",
        children: [
          { type: "img", assetId: "ast_image", url: "https://new/image", children: [{ text: "" }] },
        ],
      },
    ]);
  });

  it("keeps the stored url of external media and of assets the host did not serve", () => {
    const config = [
      { type: "img", url: "https://example.com/a.png", children: [{ text: "" }] },
      { type: "img", assetId: "ast_gone", url: "https://old/gone", children: [{ text: "" }] },
    ];

    expect(withAssetUrls(config, { ast_other: "https://new/other" })).toEqual(config);
  });

  it("leaves the config as it is without a map", () => {
    const config = [{ type: "img", assetId: "ast_image", url: "https://old", children: [] }];

    expect(withAssetUrls(config, undefined)).toBe(config);
  });
});
