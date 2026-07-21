"use client";

import editorModule from "@/editor.config";

import { useActivityEditor } from "./editor-context";

const { Editor } = editorModule;

/** Prop-free: reads the activity-editor context and mounts the installed
 *  editor with the contract's two props. */
export function EditorShell() {
  const { initialConfig, save } = useActivityEditor();
  return <Editor initialConfig={initialConfig} onSave={save} />;
}
