import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import editorModule from "@/editor.config";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { resolveAssetUrl } from "@/lib/api/asset-url";
import type { ActivitySettings } from "@/lib/api/types";
import { formatContentType } from "@/lib/format";

import { loadActivity, panelFromParam } from "../load-activity";

export default async function ActivityPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
  searchParams: Promise<{ panel?: string }>;
}) {
  const [{ courseId, activityId }, { panel }] = await Promise.all([params, searchParams]);

  const loaded = await loadActivity(courseId, activityId);
  if (!loaded) return <ForbiddenView description="You don't have access to manage this course." />;
  const { activity } = loaded;

  const settings = (activity.settings ?? {}) as ActivitySettings;
  const title = settings.title?.trim() || "Untitled activity";
  const stored = settings.content;
  const { Renderer, meta } = editorModule;
  const panelParam = panelFromParam(panel);
  const editorHref = `/courses/${courseId}/content/${activityId}${panelParam ? `?panel=${panelParam}` : ""}`;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-2">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={editorHref}>
            <ArrowLeft />
            Back to editor
          </Link>
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm text-ink-3">Preview of the saved version</p>
      </header>

      <main className="flex-1 px-3 py-6 sm:px-6 sm:py-8">
        <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-card bg-surface px-5 py-8 shadow-card ring-1 ring-ink/5 sm:px-16 sm:py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
            {title}
          </h1>
          {stored == null ? (
            <p className="text-sm text-ink-3">No content yet.</p>
          ) : stored.type !== meta.type || stored.version !== meta.version ? (
            <p className="rounded-md border border-line bg-surface-2 px-4 py-6 text-sm text-ink-3">
              This content was saved as <code>{formatContentType(stored)}</code>, but the installed
              editor renders <code>{formatContentType(meta)}</code>. It can&apos;t be displayed.
            </p>
          ) : (
            <Renderer config={stored.config} resolveAssetUrl={resolveAssetUrl} />
          )}
        </article>
      </main>
    </div>
  );
}
