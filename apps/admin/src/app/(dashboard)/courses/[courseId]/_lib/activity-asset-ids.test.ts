import { describe, expect, it } from "vitest";

import { activityAssetIds } from "./activity-asset-ids";

const editor = {
  meta: { type: "plate", version: 1 },
  assetIds: (config: unknown) => (config as { ids: string[] }).ids,
};

const content = (ids: string[], type = "plate") => ({ type, version: 1, config: { ids } });

describe("activityAssetIds", () => {
  it("links the media the editor content uses", () => {
    expect(activityAssetIds(editor, undefined, content(["ast_video", "ast_image"]), [])).toEqual([
      "ast_video",
      "ast_image",
    ]);
  });

  it("drops media removed from the content and keeps links the editor does not manage", () => {
    expect(
      activityAssetIds(
        editor,
        content(["ast_old", "ast_kept"]),
        content(["ast_kept", "ast_new"]),
        ["ast_old", "ast_kept", "ast_transcript"],
      ),
    ).toEqual(["ast_kept", "ast_new", "ast_transcript"]);
  });

  it("keeps every link when the stored content is in another editor's format", () => {
    expect(
      activityAssetIds(editor, content(["ast_old"], "tiptap"), content(["ast_new"]), ["ast_old"]),
    ).toEqual(["ast_new", "ast_old"]);
  });
});
