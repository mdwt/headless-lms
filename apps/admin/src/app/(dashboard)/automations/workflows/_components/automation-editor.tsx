"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { schemaDefaults } from "@/components/forms/schema-fields";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type {
  Automation,
  AutomationAction,
  AutomationTriggerInfo,
  AvailableAction,
  IntegrationConnection,
} from "@/lib/api/types";

import { createAutomationAction, deleteAutomationAction, updateAutomationAction } from "../actions";
import {
  draftFromAutomation,
  draftToPayload,
  isActionComplete,
  validateDraft,
  type AutomationDraft,
  type EditorSelection,
} from "./draft";
import { FlowCanvas } from "./flow-canvas";
import { ConfigPanel } from "./config-panel";

/**
 * The workflow editor: a flow canvas (triggers → ordered steps) plus a config
 * panel for the selected node. Holds the whole draft locally; Save persists it
 * through the create/update server actions in one shot.
 */
export function AutomationEditor({
  automation,
  triggers,
  availableActions,
  connections,
}: {
  automation: Automation | null;
  triggers: AutomationTriggerInfo[];
  availableActions: AvailableAction[];
  connections: IntegrationConnection[];
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const initial = useMemo(() => draftFromAutomation(automation), [automation]);
  const [draft, setDraft] = useState<AutomationDraft>(initial);
  const [selection, setSelection] = useState<EditorSelection>(
    automation ? null : { kind: "trigger" },
  );
  const [attempted, setAttempted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const defs = useMemo(() => new Map(availableActions.map((a) => [a.type, a])), [availableActions]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const incomplete = useMemo(() => {
    const set = new Set<number>();
    draft.actions.forEach((action, i) => {
      if (!isActionComplete(action, defs.get(action.type))) set.add(i);
    });
    return set;
  }, [draft.actions, defs]);

  // --- draft mutators --------------------------------------------------------

  const setTriggers = useCallback((triggers: string[]) => {
    setDraft((d) => ({ ...d, triggers }));
  }, []);

  const addStep = useCallback((index: number) => {
    setDraft((d) => {
      const actions = [...d.actions];
      actions.splice(index, 0, { type: "", input: {} });
      return { ...d, actions };
    });
    setSelection({ kind: "action", index });
  }, []);

  const changeActionType = useCallback(
    (index: number, type: string) => {
      const def = defs.get(type);
      setDraft((d) => {
        const actions = [...d.actions];
        // New type, fresh inputs — the old action's input keys don't carry over.
        actions[index] = {
          type,
          input: def ? (schemaDefaults(def.inputSchema) as AutomationAction["input"]) : {},
        };
        return { ...d, actions };
      });
    },
    [defs],
  );

  const changeActionInput = useCallback((index: number, input: Record<string, unknown>) => {
    setDraft((d) => {
      const actions = [...d.actions];
      actions[index] = { ...actions[index], input: input as AutomationAction["input"] };
      return { ...d, actions };
    });
  }, []);

  const moveStep = useCallback((index: number, delta: -1 | 1) => {
    setDraft((d) => {
      const target = index + delta;
      if (target < 0 || target >= d.actions.length) return d;
      const actions = [...d.actions];
      [actions[index], actions[target]] = [actions[target], actions[index]];
      return { ...d, actions };
    });
    setSelection({ kind: "action", index: index + delta });
  }, []);

  const stepCount = draft.actions.length;
  const removeStep = useCallback(
    (index: number) => {
      const nextCount = stepCount - 1;
      setDraft((d) => ({ ...d, actions: d.actions.filter((_, i) => i !== index) }));
      setSelection(
        nextCount <= 0
          ? { kind: "trigger" }
          : { kind: "action", index: Math.min(index, nextCount - 1) },
      );
    },
    [stepCount],
  );

  // --- persistence -----------------------------------------------------------

  const save = useCallback(() => {
    setAttempted(true);
    const problem = validateDraft(draft, defs);
    if (problem) {
      toast.error(problem);
      return;
    }
    startTransition(async () => {
      try {
        const payload = draftToPayload(draft);
        if (automation) {
          await updateAutomationAction(automation.id, {
            ...payload,
            // Send description even when cleared — a partial PATCH skips undefined.
            description: draft.description.trim(),
            enabled: draft.enabled,
          });
          toast.success("Workflow saved");
        } else {
          const created = await createAutomationAction(payload);
          // Created rows default to enabled; honor an author who switched it off.
          if (!draft.enabled) await updateAutomationAction(created.id, { enabled: false });
          toast.success("Workflow created");
          router.replace(`/automations/workflows/${created.id}`);
        }
      } catch (err) {
        toast.error("Couldn't save workflow", { description: (err as Error).message });
      }
    });
  }, [automation, draft, defs, router]);

  const confirmDelete = useCallback(() => {
    if (!automation) return;
    startTransition(async () => {
      try {
        await deleteAutomationAction(automation.id);
        toast.success("Workflow deleted");
        router.push("/automations/workflows");
      } catch (err) {
        toast.error("Couldn't delete workflow", { description: (err as Error).message });
      }
    });
  }, [automation, router]);

  const selectedTriggers = useMemo(
    () =>
      draft.triggers.map(
        (type) =>
          triggers.find((t) => t.type === type) ?? {
            type,
            label: type,
            category: "",
            description: "",
          },
      ),
    [draft.triggers, triggers],
  );

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-5">
      {/* Header: back, editable name/description, enabled + save/delete. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <Button variant="ghost" size="icon-sm" asChild className="mt-0.5 shrink-0">
            <Link href="/automations/workflows" aria-label="Back to workflows">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="flex min-w-0 flex-1 flex-col">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Untitled workflow"
              aria-label="Workflow name"
              className={cn(
                "-mx-1.5 w-full max-w-xl rounded-md bg-transparent px-1.5 py-0.5 text-xl font-semibold tracking-tight text-ink outline-none transition-colors placeholder:text-ink-faint hover:bg-hover/60 focus:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40",
                attempted && !draft.name.trim() && "ring-2 ring-danger/40",
              )}
            />
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Add a description…"
              aria-label="Workflow description"
              className="-mx-1.5 w-full max-w-xl rounded-md bg-transparent px-1.5 py-0.5 text-sm text-ink-2 outline-none transition-colors placeholder:text-ink-4 hover:bg-hover/60 focus:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 lg:pl-4">
          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-sm text-ink-3">{draft.enabled ? "Enabled" : "Disabled"}</span>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
              aria-label="Enabled"
            />
          </label>
          {automation ? (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={pending || (automation != null && !dirty)}
          >
            {pending && <Loader2 className="animate-spin" />}
            {automation ? "Save" : "Create workflow"}
          </Button>
        </div>
      </div>

      {/* Canvas + config panel. */}
      <div className="flex min-h-[540px] flex-col overflow-hidden rounded-xl border border-line bg-surface lg:h-[calc(100dvh-14rem)] lg:flex-row">
        <div className="relative h-[420px] flex-1 lg:h-auto">
          <FlowCanvas
            draft={draft}
            selectedTriggers={selectedTriggers}
            defs={defs}
            selection={selection}
            incomplete={incomplete}
            attempted={attempted}
            onSelect={setSelection}
            onAddStep={addStep}
          />
        </div>
        <aside className="overflow-y-auto border-t border-line lg:w-[360px] lg:shrink-0 lg:border-t-0 lg:border-l">
          <ConfigPanel
            draft={draft}
            selection={selection}
            triggers={triggers}
            availableActions={availableActions}
            connections={connections}
            defs={defs}
            onTriggersChange={setTriggers}
            onActionTypeChange={changeActionType}
            onActionInputChange={changeActionInput}
            onMoveStep={moveStep}
            onRemoveStep={removeStep}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete workflow?"
        description={`"${draft.name || "This workflow"}" will stop running and its configuration will be removed. Past run history is kept for auditing.`}
        confirmLabel="Delete workflow"
        destructive
        pending={pending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
