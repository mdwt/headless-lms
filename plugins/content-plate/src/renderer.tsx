// Contract entry: RSC-safe static renderer — no 'use client', no hooks.
// Builds a server-side editor from the base kit and renders it with
// PlateStatic (via EditorStatic), so no editor JS ships on routes
// that only display content. Asset-backed media nodes render the URL the host
// served with the content.
import { createSlateEditor, type Value } from "platejs";

import type { AssetUrls } from "@headless-lms/editor";

import { withAssetUrls } from "./asset-urls";
import { BaseEditorKit } from "./editor/editor-base-kit";
import { EditorStatic } from "./ui/editor-static";
import { isNodeList } from "./validate";

export function Renderer({ config, assetUrls }: { config: unknown; assetUrls: AssetUrls }) {
  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    value: isNodeList(config) ? withAssetUrls(config as Value, assetUrls) : [],
  });

  return <EditorStatic editor={editor} variant="select" />;
}
