import { describe, expect, it } from "vitest";

import { withAssetUrls, withoutAssetUrls } from "./asset-urls";

describe("withAssetUrls", () => {
  it("gives every asset node the url the host served for it, nested ones included", () => {
    const config = [
      { type: "video", assetId: "ast_video", children: [{ text: "" }] },
      {
        type: "column_group",
        children: [{ type: "img", assetId: "ast_image", children: [{ text: "" }] }],
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

  it("leaves an asset node the host did not serve without a url", () => {
    expect(
      withAssetUrls([{ type: "img", assetId: "ast_gone", url: "https://x", children: [] }], {}),
    ).toEqual([{ type: "img", assetId: "ast_gone", children: [] }]);
  });

  it("keeps the url of external media", () => {
    const config = [{ type: "img", url: "https://example.com/a.png", children: [{ text: "" }] }];

    expect(withAssetUrls(config, {})).toEqual(config);
  });
});

describe("withoutAssetUrls", () => {
  it("drops the url of every asset node and keeps the url of external media", () => {
    expect(
      withoutAssetUrls([
        { type: "img", assetId: "ast_image", url: "https://signed", children: [{ text: "" }] },
        {
          type: "toggle",
          children: [{ type: "file", assetId: "ast_file", url: "https://signed", children: [] }],
        },
        { type: "video", url: "https://youtube.com/watch?v=1", children: [{ text: "" }] },
      ]),
    ).toEqual([
      { type: "img", assetId: "ast_image", children: [{ text: "" }] },
      { type: "toggle", children: [{ type: "file", assetId: "ast_file", children: [] }] },
      { type: "video", url: "https://youtube.com/watch?v=1", children: [{ text: "" }] },
    ]);
  });
});
