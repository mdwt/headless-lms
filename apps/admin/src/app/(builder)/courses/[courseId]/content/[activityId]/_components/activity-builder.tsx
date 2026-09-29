"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Blocks,
  ChevronLeft,
  ChevronRight,
  Eye,
  ListTree,
  PanelLeftClose,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import editorModule from "@/editor.config";
import { getAssetUrlAction } from "@/app/(dashboard)/media/actions";
import {
  deleteActivityAction,
  updateActivitySettingsAction,
} from "@/app/(dashboard)/courses/[courseId]/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ActivityNode, ActivitySettings, ModuleTree } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import type { BuilderPanel } from "../load-activity";
import { ActivitySettingsPanel } from "./activity-settings-panel";
import { CurriculumPanel } from "./curriculum-panel";
import { useAssetPicker } from "./editor-pick-asset";
import { uploadEditorFile } from "./editor-upload";

const { Editor, validate, meta } = editorModule;
const hasBlockLibrary = editorModule.slots?.includes("blocks") ?? false;
const hasToolbar = editorModule.slots?.includes("toolbar") ?? false;

const resolveAssetUrl = (assetId: string) => getAssetUrlAction(assetId).catch(() => null);

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this activity a title")
    .max(120, "Keep the title under 120 characters"),
  published: z.boolean(),
  completion: z.enum(["view", "video", "manual"]),
  transcriptDownloads: z.enum(["inherit", "always", "never"]),
  comments: z.enum(["inherit", "always", "never"]),
});

export type ActivityFormValues = z.infer<typeof schema>;

function toDefaults(settings: ActivitySettings): ActivityFormValues {
  return {
    title: settings.title ?? "",
    published: settings.published ?? false,
    completion: settings.completion ?? "view",
    transcriptDownloads: settings.transcriptDownloads ?? "inherit",
    comments: settings.comments ?? "inherit",
  };
}

const PANELS: { id: BuilderPanel; label: string; title: string; icon: LucideIcon }[] = [
  { id: "curriculum", label: "Curriculum", title: "Curriculum", icon: ListTree },
  ...(hasBlockLibrary
    ? [{ id: "blocks" as const, label: "Blocks", title: "Blocks", icon: Blocks }]
    : []),
  { id: "settings", label: "Settings", title: "Activity settings", icon: SlidersHorizontal },
];

const DEFAULT_PANEL: BuilderPanel = hasBlockLibrary ? "blocks" : "curriculum";

const DESKTOP_QUERY = "(min-width: 64rem)";

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

function titleOf(activity: ActivityNode) {
  return ((activity.settings ?? {}) as ActivitySettings).title?.trim() || "Untitled activity";
}

export function ActivityBuilder({
  course,
  modules,
  moduleId,
  activity,
  initialConfig,
  foreignFormat,
  installedFormat,
  initialPanel,
  courseTranscriptDownloads,
  courseCommentsEnabled,
}: {
  course: { id: string; title: string };
  modules: ModuleTree[];
  moduleId: string;
  activity: ActivityNode;
  initialConfig: unknown;
  foreignFormat: string | null;
  installedFormat: string;
  initialPanel: BuilderPanel | "none" | undefined;
  courseTranscriptDownloads: boolean;
  courseCommentsEnabled: boolean;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { pickAsset, picker } = useAssetPicker();

  const [panel, setPanel] = useState<BuilderPanel | null>(() => {
    if (initialPanel === "none") return null;
    return PANELS.find((p) => p.id === initialPanel)?.id ?? DEFAULT_PANEL;
  });
  const [sheetPanel, setSheetPanel] = useState<BuilderPanel | null>(null);
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);
  const [blocksEl, setBlocksEl] = useState<HTMLDivElement | null>(null);
  const [contentDirty, setContentDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const latestConfig = useRef<unknown>(initialConfig);
  const titleEl = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults((activity.settings ?? {}) as ActivitySettings),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = form;
  const { ref: registerTitleRef, ...titleField } = register("title");

  const dirty = isDirty || contentDirty;
  const base = `/courses/${course.id}/content`;
  const currentModule = modules.find((m) => m.id === moduleId);
  const position = (currentModule?.activities.findIndex((a) => a.id === activity.id) ?? 0) + 1;

  const ordered = useMemo(() => modules.flatMap((m) => m.activities), [modules]);
  const index = ordered.findIndex((a) => a.id === activity.id);
  const previous = index > 0 ? ordered[index - 1] : undefined;
  const next = index >= 0 ? ordered[index + 1] : undefined;

  const hrefFor = useCallback(
    (id: string) => `${base}/${id}?panel=${panel ?? "none"}`,
    [base, panel],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", panel ?? "none");
    window.history.replaceState(null, "", url);
  }, [panel]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const fitTitle = useCallback(() => {
    const el = titleEl.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    fitTitle();
    window.addEventListener("resize", fitTitle);
    return () => window.removeEventListener("resize", fitTitle);
  }, [fitTitle]);

  const save = useCallback(async (): Promise<boolean> => {
    const submitted: { values?: ActivityFormValues } = {};
    await handleSubmit((values) => {
      submitted.values = values;
    })();
    const values = submitted.values;
    if (!values) return false;

    const patch: Partial<ActivitySettings> = isDirty ? { ...values } : {};
    if (contentDirty) {
      const config = latestConfig.current;
      const result = validate?.(config);
      if (result && !result.ok) {
        toast.error("Couldn't save activity", { description: result.errors.join("; ") });
        return false;
      }
      patch.content = { config, type: meta.type, version: meta.version };
    }
    if (Object.keys(patch).length === 0) return true;

    setSaving(true);
    try {
      await updateActivitySettingsAction(course.id, moduleId, activity.id, patch);
      reset(values);
      setContentDirty(false);
      toast.success("Saved");
      router.refresh();
      return true;
    } catch (err) {
      toast.error("Couldn't save activity", { description: (err as Error).message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [handleSubmit, isDirty, contentDirty, reset, course.id, moduleId, activity.id, router]);

  const leave = useCallback(
    async (href: string) => {
      if (dirty && !(await save())) return;
      router.push(href);
    },
    [dirty, save, router],
  );

  const guardLink = useCallback(
    (e: ReactMouseEvent<HTMLAnchorElement>) => {
      if (!dirty || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      void leave(e.currentTarget.getAttribute("href") ?? base);
    },
    [dirty, leave, base],
  );

  const onEditorChange = useCallback((config: unknown) => {
    latestConfig.current = config;
    setContentDirty(true);
  }, []);

  const onEditorSave = useCallback(
    async (config: unknown) => {
      latestConfig.current = config;
      await save();
    },
    [save],
  );

  const slots = useMemo(() => ({ toolbar: toolbarEl, blocks: blocksEl }), [toolbarEl, blocksEl]);

  async function deleteActivity() {
    setDeleting(true);
    try {
      await deleteActivityAction(course.id, moduleId, activity.id);
      toast.success("Activity deleted");
      router.push(base);
    } catch (err) {
      toast.error("Couldn't delete activity", { description: (err as Error).message });
      setDeleting(false);
    }
  }

  function selectPanel(id: BuilderPanel) {
    if (isDesktop) setPanel((current) => (current === id ? null : id));
    else setSheetPanel(id);
  }

  function renderPanel(id: BuilderPanel) {
    if (id === "curriculum") {
      return (
        <CurriculumPanel
          courseId={course.id}
          modules={modules}
          activityId={activity.id}
          hrefFor={hrefFor}
          onNavigate={guardLink}
        />
      );
    }
    if (id === "blocks") {
      return <div ref={setBlocksEl} className="flex min-h-0 flex-1 flex-col" />;
    }
    return (
      <ActivitySettingsPanel
        form={form}
        courseTranscriptDownloads={courseTranscriptDownloads}
        courseCommentsEnabled={courseCommentsEnabled}
        onDelete={() => setConfirmingDelete(true)}
      />
    );
  }

  const activePanel = isDesktop ? panel : sheetPanel;
  const desktopPanel = PANELS.find((p) => p.id === panel);
  const mobilePanel = PANELS.find((p) => p.id === sheetPanel);

  return (
    <div className="flex h-dvh flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:gap-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to course">
          <Link href={base} onClick={guardLink}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{course.title}</p>
        {saving ? (
          <p className="text-[0.8125rem] text-ink-3">Saving…</p>
        ) : dirty ? (
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-ink-3">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
            <span className="max-sm:sr-only">Unsaved changes</span>
          </p>
        ) : null}
        <Button asChild variant="secondary" size="sm">
          <Link href={`${base}/${activity.id}/preview?panel=${panel ?? "none"}`} onClick={guardLink}>
            <Eye />
            Preview
          </Link>
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Builder panels"
          className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-line py-2 max-lg:hidden"
        >
          {PANELS.map((p) => (
            <RailButton
              key={p.id}
              icon={p.icon}
              label={p.label}
              active={activePanel === p.id}
              onClick={() => selectPanel(p.id)}
            />
          ))}
        </nav>

        {isDesktop && desktopPanel ? (
          <aside
            aria-label={desktopPanel.title}
            className="flex w-80 shrink-0 flex-col border-r border-line max-lg:hidden"
          >
            <div className="flex h-13 shrink-0 items-center justify-between pr-2 pl-4">
              <h2 className="text-sm font-semibold text-ink">{desktopPanel.title}</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <PanelLeftClose />
              </Button>
            </div>
            {renderPanel(desktopPanel.id)}
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface-2">
          {hasToolbar ? (
            <div className="pointer-events-none sticky top-0 z-20 flex justify-center px-3 pt-3 pb-2 sm:px-6">
              <div
                ref={setToolbarEl}
                className="pointer-events-auto flex max-w-full rounded-card bg-surface p-1 shadow-card ring-1 ring-ink/5 empty:hidden"
              />
            </div>
          ) : null}

          <div className={cn("flex-1 px-3 pb-6 sm:px-6", !hasToolbar && "pt-6")}>
            <article className="mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-card bg-surface px-5 pt-8 shadow-card ring-1 ring-ink/5 sm:px-16 sm:pt-12">
              <div className="flex flex-col gap-1">
                {currentModule ? (
                  <p className="text-sm text-ink-3">{currentModule.title}</p>
                ) : null}
                <textarea
                {...titleField}
                ref={(el) => {
                  registerTitleRef(el);
                  titleEl.current = el;
                }}
                rows={1}
                aria-label="Activity title"
                aria-invalid={errors.title ? true : undefined}
                placeholder="Untitled activity"
                onInput={fitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="w-full resize-none overflow-hidden bg-transparent text-3xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-faint sm:text-4xl"
                />
                {errors.title ? (
                  <p role="alert" className="text-sm text-danger">
                    {errors.title.message}
                  </p>
                ) : null}
              </div>
              {foreignFormat ? (
                <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
                  This activity has content saved as <code>{foreignFormat}</code>, which the
                  installed editor ({installedFormat}) can&apos;t open. Saving will replace it.
                </p>
              ) : null}
              <Editor
                initialConfig={initialConfig}
                onChange={onEditorChange}
                onSave={onEditorSave}
                pickAsset={pickAsset}
                resolveAssetUrl={resolveAssetUrl}
                uploadFile={uploadEditorFile}
                slots={slots}
              />
            </article>
          </div>

          <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center pb-1">
            <nav
              aria-label="Activities"
              className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-card ring-1 ring-ink/5"
            >
              <PagerLink
                activity={previous}
                href={previous ? hrefFor(previous.id) : undefined}
                direction="previous"
                onNavigate={guardLink}
              />
              <p className="px-2 text-[0.8125rem] whitespace-nowrap text-ink-2 tabular-nums">
                Activity {position} of {currentModule?.activities.length ?? 1}
              </p>
              <PagerLink
                activity={next}
                href={next ? hrefFor(next.id) : undefined}
                direction="next"
                onNavigate={guardLink}
              />
            </nav>
          </div>
        </main>
      </div>

      <nav
        aria-label="Builder panels"
        className="flex shrink-0 justify-around border-t border-line px-2 py-1 lg:hidden"
      >
        {PANELS.map((p) => (
          <RailButton
            key={p.id}
            icon={p.icon}
            label={p.label}
            active={activePanel === p.id}
            onClick={() => selectPanel(p.id)}
          />
        ))}
      </nav>

      {!isDesktop ? (
        <Sheet
          modal={false}
          open={mobilePanel !== undefined}
          onOpenChange={(open) => {
            if (!open) setSheetPanel(null);
          }}
        >
          <SheetContent
            side="left"
            className="w-80 max-w-[85vw]"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>{mobilePanel?.title}</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col pt-3">
              {mobilePanel ? renderPanel(mobilePanel.id) : null}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete activity"
        description={
          <>
            Delete <span className="font-medium text-ink">{titleOf(activity)}</span>? This
            can&apos;t be undone.
          </>
        }
        confirmLabel="Delete activity"
        pending={deleting}
        onConfirm={() => void deleteActivity()}
      />

      {picker}
    </div>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-15 w-16 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active ? "bg-selected text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

function PagerLink({
  activity,
  href,
  direction,
  onNavigate,
}: {
  activity: ActivityNode | undefined;
  href: string | undefined;
  direction: "previous" | "next";
  onNavigate: (e: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const label = direction === "previous" ? "Previous activity" : "Next activity";

  if (!activity || !href) {
    return (
      <Button variant="ghost" size="icon-sm" className="rounded-full" disabled aria-label={label}>
        <Icon />
      </Button>
    );
  }

  return (
    <Button
      asChild
      variant="ghost"
      size="icon-sm"
      className="rounded-full"
      aria-label={`${label}: ${titleOf(activity)}`}
    >
      <Link href={href} onClick={onNavigate}>
        <Icon />
      </Link>
    </Button>
  );
}
