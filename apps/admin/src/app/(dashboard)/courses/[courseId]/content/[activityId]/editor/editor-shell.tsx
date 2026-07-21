"use client";

import editorModule from "@/editor.config";

import { useActivityEditor } from "./editor-context";
import { uploadEditorFile } from "./editor-upload";

const { Editor } = editorModule;

/** Prop-free: reads the activity-editor context and mounts the installed
 *  editor, with media uploads wired to the assets API. */
export function EditorShell() {
  const { initialConfig, onChange, save } = useActivityEditor();
  return (
    <Editor
      initialConfig={initialConfig}
      onChange={onChange}
      onSave={save}
      uploadFile={uploadEditorFile}
    />
  );
}
