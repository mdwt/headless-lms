import type { EditorModule } from "@headless-lms/editor";

import type { ActivityContent } from "@/lib/api/types";

type Editor = Pick<EditorModule, "assetIds" | "meta">;

export function activityAssetIds(
  editor: Editor,
  content: ActivityContent | undefined,
): string[] | undefined {
  if (!content || content.type !== editor.meta.type || content.version !== editor.meta.version) {
    return undefined;
  }
  return editor.assetIds(content.config);
}
