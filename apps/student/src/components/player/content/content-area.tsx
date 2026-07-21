import editorModule from "@/editor.config";
import type { ActivityContent } from "@/lib/api/types";

// Renders an activity's stored content through the installed editor's RSC-safe
// `Renderer`, guarded by type/version (mirrors the admin preview). No editor JS
// ships here; a config in a foreign format renders a notice, never the content.
export function ContentArea({ content }: { content: ActivityContent | null }) {
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
