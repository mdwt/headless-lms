"use client";

import editorModule from "@/editor.config";

import { getAssetUrlAction } from "@/app/(dashboard)/media/actions";

import { useActivityEditor } from "./editor-context";
import { useAssetPicker } from "./editor-pick-asset";
import { uploadEditorFile } from "./editor-upload";

const { Editor } = editorModule;

// Stored configs embed save-time presigns that expire; media nodes re-sign
// per asset through this. Module-scoped for a stable identity across renders.
const resolveAssetUrl = (assetId: string) => getAssetUrlAction(assetId).catch(() => null);

/** Prop-free: reads the activity-editor context and mounts the installed
 *  editor, with media uploads and the media-library picker wired to the
 *  assets API. */
export function EditorShell() {
  const { initialConfig, onChange, save } = useActivityEditor();
  const { pickAsset, picker } = useAssetPicker();
  return (
    <>
      <Editor
        initialConfig={initialConfig}
        onChange={onChange}
        onSave={save}
        pickAsset={pickAsset}
        resolveAssetUrl={resolveAssetUrl}
        uploadFile={uploadEditorFile}
      />
      {picker}
    </>
  );
}
