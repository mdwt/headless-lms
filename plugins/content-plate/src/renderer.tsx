// Contract entry: RSC-safe static renderer — no 'use client', no hooks.
// Builds a server-side editor from the base kit and renders it with
// PlateStatic (via EditorStatic), so no editor JS ships on routes
// that only display content.
import { createSlateEditor, type Value } from 'platejs';

import { BaseEditorKit } from './editor/editor-base-kit';
import { EditorStatic } from './ui/editor-static';
import { isNodeList } from './validate';

export function Renderer({ config }: { config: unknown }) {
  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    value: isNodeList(config) ? (config as Value) : [],
  });

  return <EditorStatic editor={editor} variant="select" />;
}
