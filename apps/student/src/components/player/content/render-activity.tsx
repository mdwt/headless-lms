import type { ReactNode } from "react";

import editorModule from "@/editor.config";
import type { ActivityContent } from "@/lib/api/types";

// Renders an activity's stored content on the SERVER via the installed editor's
// RSC-safe `Renderer`, guarded by type/version (mirrors the admin preview). The
// result is handed to the client player as ready-made nodes, so the Plate static
// tree renders once on the server and is never re-executed on the client — Plate
// assigns non-deterministic node ids per `createSlateEditor`, so re-running it on
// the client would produce a hydration mismatch. No editor JS ships either; a
// config in a foreign format renders a notice, never the content.
export function renderActivityContent(content: ActivityContent | null): ReactNode {
  const { Renderer, meta } = editorModule;

  if (content == null) {
    return <div className="mx-auto max-w-[720px] px-6 py-16 text-ink-3">No content yet.</div>;
  }
  if (content.type !== meta.type || content.version !== meta.version) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-16 text-ink-3">
        This content was saved in a format the player can&apos;t display.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <Renderer config={content.config} />
    </div>
  );
}
