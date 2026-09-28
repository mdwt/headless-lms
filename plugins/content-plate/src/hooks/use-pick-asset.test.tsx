import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type PickAssetHandler, PickAssetProvider, usePickAsset } from "./use-pick-asset";

/** Renders `tree` and returns whatever the probe inside it read from context. */
function seenIn(render: (Probe: () => null) => ReactElement): PickAssetHandler | null | undefined {
  let seen: PickAssetHandler | null | undefined;
  const Probe = () => {
    seen = usePickAsset();
    return null;
  };
  renderToString(render(Probe));
  return seen;
}

describe("usePickAsset", () => {
  it("passes the host handler through the provider", () => {
    const pickAsset: PickAssetHandler = async () => null;

    const seen = seenIn((Probe) => (
      <PickAssetProvider pickAsset={pickAsset}>
        <Probe />
      </PickAssetProvider>
    ));

    expect(seen).toBe(pickAsset);
  });

  it("is null with no host handler, so the library affordance stays hidden", () => {
    const seen = seenIn((Probe) => (
      <PickAssetProvider pickAsset={null}>
        <Probe />
      </PickAssetProvider>
    ));

    expect(seen).toBeNull();
  });

  it("is null outside a provider", () => {
    expect(seenIn((Probe) => <Probe />)).toBeNull();
  });
});
