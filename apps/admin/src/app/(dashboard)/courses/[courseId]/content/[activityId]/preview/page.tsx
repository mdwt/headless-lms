import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import type { ActivitySettings } from "@/lib/api/types";
import { formatContentType } from "@/lib/format";
import editorModule from "@/editor.config";

// Server-rendered preview of an activity's saved content, via the contract's
// RSC-safe `Renderer` — the same path a student-facing surface would use. No
// editor JS ships on this route. A stored config whose format doesn't match
// the installed editor renders an error, never the content.
export default async function ActivityPreviewPage({
  params,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
}) {
  const { courseId, activityId } = await params;

  const modulesPromise = serverApi.listModules(courseId);
  await requireAuth(modulesPromise);
  const modules = await modulesPromise;

  const activity = modules
    .flatMap((m) => m.activities)
    .find((a) => a.id === activityId);
  if (!activity) notFound();

  const settings = (activity.settings ?? {}) as ActivitySettings;
  const stored = settings.content;
  const { Renderer, meta } = editorModule;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-2">
          {settings.title?.trim() || "Untitled activity"} · Preview
        </h2>
        <Link
          className="text-sm text-ink-3 underline-offset-4 hover:underline"
          href={`/courses/${courseId}/content/${activityId}/editor`}
        >
          Edit content
        </Link>
      </div>

      {stored == null ? (
        <p className="rounded-md border border-line bg-surface-2 px-4 py-6 text-sm text-ink-3">
          No content yet.
        </p>
      ) : stored.type !== meta.type || stored.version !== meta.version ? (
        <p className="rounded-md border border-line bg-surface-2 px-4 py-6 text-sm text-ink-3">
          This content was saved as <code>{formatContentType(stored)}</code>, but the installed
          editor renders <code>{formatContentType(meta)}</code>. It can&apos;t be displayed.
        </p>
      ) : (
        <div className="rounded-md border border-line bg-surface px-4 py-4">
          <Renderer config={stored.config} />
        </div>
      )}
    </section>
  );
}
