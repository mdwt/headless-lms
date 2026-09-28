"use client";

// Host-provided media-library picking. The app embedding the editor supplies a
// `PickAssetHandler` that opens its own library UI (for the LMS admin: a dialog
// over the media library) and resolves the chosen asset — or `null` if the
// author cancelled. Media components consume it through `usePickAsset`.
// Without a handler there is no library to browse, so the affordance is hidden
// entirely rather than shown broken.

import { createContext, useContext, type ReactNode } from "react";

import type { UploadedFile } from "./use-upload-file";

export type PickAssetKind = "image" | "video" | "audio" | "file";

export type PickAssetHandler = (opts: { kind: PickAssetKind }) => Promise<UploadedFile | null>;

const PickAssetContext = createContext<PickAssetHandler | null>(null);

export function PickAssetProvider({
  children,
  pickAsset,
}: {
  children: ReactNode;
  pickAsset: PickAssetHandler | null;
}) {
  return <PickAssetContext.Provider value={pickAsset}>{children}</PickAssetContext.Provider>;
}

/** The host's picker, or `null` when the host configured none. */
export function usePickAsset(): PickAssetHandler | null {
  return useContext(PickAssetContext);
}
