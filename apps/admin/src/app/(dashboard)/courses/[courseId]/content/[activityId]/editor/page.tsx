import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import type { ActivitySettings } from "@/lib/api/types";
import { formatContentType } from "@/lib/format";
import editorModule from "@/editor.config";

import { ActivityEditorProvider } from "./editor-context";
import { EditorShell } from "./editor-shell";

// Content editor for one activity. RSC: loads the stored config blob and hands
// it to the client shell. Which editor renders is decided by `@/editor.config`
// (the per-deployment swap point) — this route never imports an editor package.
export default async function ActivityEditorPage({
  params,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
}) {
  const { courseId, activityId } = await params;

  const modulesPromise = serverApi.listModules(courseId);
  await requireAuth(modulesPromise);
  const modules = await modulesPromise;

  const parent = modules.find((m) => m.activities.some((a) => a.id === activityId));
  const activity = parent?.activities.find((a) => a.id === activityId);
  if (!parent || !activity) notFound();

  const settings = (activity.settings ?? {}) as ActivitySettings;
  const stored = settings.content;
  const { meta } = editorModule;

  // Only feed the editor configs it produced; a foreign blob (different type
  // or breaking version) is left untouched on disk and the editor starts
  // empty (saving replaces it).
  const foreignFormat =
    stored != null && (stored.type !== meta.type || stored.version !== meta.version);
  const initialConfig = stored != null && !foreignFormat ? stored.config : null;

  return (
    <section className="editor-container flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium text-ink-2">
            {settings.title?.trim() || "Untitled activity"}
          </h2>
          <p className="text-xs text-ink-4">
            Content editor · {formatContentType(meta)}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            className="text-ink-3 underline-offset-4 hover:underline"
            href={`/courses/${courseId}/content/${activityId}/preview`}
          >
            Preview
          </Link>
          <Link
            className="text-ink-3 underline-offset-4 hover:underline"
            href={`/courses/${courseId}/content`}
          >
            Back to curriculum
          </Link>
        </div>
      </div>

      {foreignFormat ? (
        <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
          This activity has content saved as <code>{formatContentType(stored!)}</code>, which the
          installed editor ({formatContentType(meta)}) can&apos;t open. Saving will replace it.
        </p>
      ) : null}

      <ActivityEditorProvider
        courseId={courseId}
        moduleId={parent.id}
        activityId={activityId}
        initialConfig={initialConfig}
      >
        <EditorShell />
      </ActivityEditorProvider>
    </section>
  );
}
