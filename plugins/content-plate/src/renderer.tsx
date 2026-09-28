// Contract entry: RSC-safe static renderer — no 'use client', no hooks.
// Builds a server-side editor from the base kit and renders it with
// PlateStatic (via EditorStatic), so no editor JS ships on routes
// that only display content.
//
// When the host supplies `resolveAssetUrl`, asset-backed media components are
// overridden with wrappers that carry the broker: each node awaits a fresh
// URL for its own assetId during server render, so the stored (expired)
// presign in the config is never what reaches the browser.
import type { ComponentProps } from "react";

import { createSlateEditor, KEYS, type Value } from "platejs";

import type { ResolveAssetUrl } from "@headless-lms/editor";

import { BaseEditorKit } from "./editor/editor-base-kit";
import { EditorStatic } from "./ui/editor-static";
import { MediaAudioElementStatic } from "./ui/media-audio-node-static";
import { MediaFileElementStatic } from "./ui/media-file-node-static";
import { ImageElementStatic } from "./ui/media-image-node-static";
import { MediaVideoElementStatic } from "./ui/media-video-node-static";
import { isNodeList } from "./validate";

const mediaComponents = (resolveAssetUrl: ResolveAssetUrl) => ({
  [KEYS.img]: (props: ComponentProps<typeof ImageElementStatic>) => (
    <ImageElementStatic {...props} resolveAssetUrl={resolveAssetUrl} />
  ),
  [KEYS.video]: (props: ComponentProps<typeof MediaVideoElementStatic>) => (
    <MediaVideoElementStatic {...props} resolveAssetUrl={resolveAssetUrl} />
  ),
  [KEYS.audio]: (props: ComponentProps<typeof MediaAudioElementStatic>) => (
    <MediaAudioElementStatic {...props} resolveAssetUrl={resolveAssetUrl} />
  ),
  [KEYS.file]: (props: ComponentProps<typeof MediaFileElementStatic>) => (
    <MediaFileElementStatic {...props} resolveAssetUrl={resolveAssetUrl} />
  ),
});

export function Renderer({
  config,
  resolveAssetUrl,
}: {
  config: unknown;
  resolveAssetUrl?: ResolveAssetUrl;
}) {
  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    ...(resolveAssetUrl ? { override: { components: mediaComponents(resolveAssetUrl) } } : {}),
    value: isNodeList(config) ? (config as Value) : [],
  });

  return <EditorStatic editor={editor} variant="select" />;
}
