import type { EditorModule } from "@headless-lms/editor";

import type { ActivityContent } from "@/lib/api/types";

type Editor = Pick<EditorModule, "assetIds" | "meta">;

function editorAssetIds(editor: Editor, content: ActivityContent | undefined): string[] {
  if (!content || content.type !== editor.meta.type || content.version !== editor.meta.version) {
    return [];
  }
  return editor.assetIds(content.config);
}

export function activityAssetIds(
  editor: Editor,
  stored: ActivityContent | undefined,
  next: ActivityContent | undefined,
  linked: string[],
): string[] {
  const managed = new Set(editorAssetIds(editor, stored));
  const kept = linked.filter((id) => !managed.has(id));
  return [...new Set([...editorAssetIds(editor, next), ...kept])];
}
