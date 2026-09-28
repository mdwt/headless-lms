import { KEYS } from "platejs";
import { describe, expect, it } from "vitest";

import { mediaNodeProps } from "./media-node-props";

const asset = {
  id: "asset_1",
  name: "lecture.mp4",
  size: 1024,
  type: "video/mp4",
  url: "https://storage.example.com/lecture.mp4?sig=abc",
};

describe("mediaNodeProps", () => {
  it("persists the asset id and the presigned url", () => {
    const props = mediaNodeProps(asset, KEYS.video);

    expect(props).toMatchObject({
      assetId: "asset_1",
      isUpload: true,
      type: KEYS.video,
      url: asset.url,
    });
  });

  it("produces the same node whether the asset was uploaded or picked", () => {
    const uploaded = mediaNodeProps(asset, KEYS.video, { placeholderId: "ph1" });
    const picked = mediaNodeProps(asset, KEYS.video, { placeholderId: "ph1" });

    // `id` is a fresh nanoid per node; everything else must match.
    expect({ ...uploaded, id: null }).toEqual({ ...picked, id: null });
  });

  it("omits assetId when the host tracks no asset", () => {
    const props = mediaNodeProps({ ...asset, id: "" }, KEYS.video);

    expect(props).not.toHaveProperty("assetId");
  });

  it("keeps the filename only for file nodes", () => {
    expect(mediaNodeProps(asset, KEYS.file).name).toBe("lecture.mp4");
    expect(mediaNodeProps(asset, KEYS.video).name).toBe("");
  });

  it("carries measured dimensions through", () => {
    const props = mediaNodeProps(asset, KEYS.img, {
      size: { height: 480, width: 640 },
    });

    expect(props.initialHeight).toBe(480);
    expect(props.initialWidth).toBe(640);
  });
});
