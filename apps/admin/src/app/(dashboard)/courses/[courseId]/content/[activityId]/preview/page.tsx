import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PenLine } from "lucide-react";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { resolveAssetUrls } from "@/lib/api/resolve-asset-urls";
import type { ActivitySettings } from "@/lib/api/types";
import { formatContentType } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to editor">
          <Link href={`/courses/${courseId}/content/${activityId}/editor`}>
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {settings.title?.trim() || "Untitled activity"}
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/courses/${courseId}/content/${activityId}/editor`}>
            <PenLine />
            Edit
          </Link>
        </Button>
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
        <Renderer config={await resolveAssetUrls(stored.config)} />
      )}
    </section>
  );
}
