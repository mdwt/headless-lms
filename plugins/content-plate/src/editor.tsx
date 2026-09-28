"use client";

// Contract entry: the interactive Notion-style editor. A pure document
// surface — no chrome, no border, no inner scroll region: the page scrolls.
// Slash commands, drag handles, block selection, floating toolbar, and media
// all come from the kits. Save UI belongs to the host (via `onChange`);
// Ctrl/Cmd+S triggers `onSave` directly.
import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { useEffect } from "react";

import type { PageEditorProps } from "@headless-lms/editor";

import { EditorKit } from "./editor/editor-kit";
import { PickAssetProvider } from "./hooks/use-pick-asset";
import { ResolveAssetUrlProvider } from "./hooks/use-resolve-asset-url";
import { UploadProvider } from "./hooks/use-upload-file";
import { Editor as EditorArea, EditorContainer } from "./ui/editor";
import { isNodeList } from "./validate";

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];

export function Editor({
  initialConfig,
  onChange,
  onSave,
  pickAsset,
  resolveAssetUrl,
  uploadFile,
}: PageEditorProps) {
  const editor = usePlateEditor({
    plugins: EditorKit,
    value: isNodeList(initialConfig) ? (initialConfig as Value) : EMPTY_VALUE,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void onSave(editor.children);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor, onSave]);

  return (
    <UploadProvider uploadFile={uploadFile ?? null}>
      <PickAssetProvider pickAsset={pickAsset ?? null}>
        <ResolveAssetUrlProvider resolveAssetUrl={resolveAssetUrl ?? null}>
          <Plate editor={editor} onChange={({ value }) => onChange?.(value)}>
            <EditorContainer className="h-auto overflow-visible" variant="default">
              <EditorArea placeholder="Type '/' for commands…" variant="default" />
            </EditorContainer>
          </Plate>
        </ResolveAssetUrlProvider>
      </PickAssetProvider>
    </UploadProvider>
  );
}
