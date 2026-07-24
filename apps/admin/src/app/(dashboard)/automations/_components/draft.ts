import type { Automation, AutomationAction, AvailableAction } from "@/lib/api/types";

/** The editor's working copy of an automation's config object. */
export interface AutomationDraft {
  name: string;
  description: string;
  trigger: string;
  actions: AutomationAction[];
  enabled: boolean;
}

export type EditorSelection = { kind: "trigger" } | { kind: "action"; index: number } | null;

export function draftFromAutomation(automation: Automation | null): AutomationDraft {
  if (!automation) return { name: "", description: "", trigger: "", actions: [], enabled: true };
  return {
    name: automation.name,
    description: automation.description ?? "",
    trigger: automation.trigger,
    actions: automation.actions.map((a) => ({ type: a.type, input: { ...a.input } })),
    enabled: automation.enabled,
  };
}

export function requiredInputKeys(def: AvailableAction | undefined): string[] {
  const required = (def?.inputSchema as { required?: unknown } | undefined)?.required;
  return Array.isArray(required)
    ? required.filter((k): k is string => typeof k === "string")
    : [];
}

const isBlank = (v: unknown) => v == null || v === "";

/** A step is complete when its type is chosen and every schema-required input is set. */
export function isActionComplete(
  action: AutomationAction,
  def: AvailableAction | undefined,
): boolean {
  if (!action.type || !def) return false;
  return requiredInputKeys(def).every((key) => !isBlank(action.input[key]));
}

/** First problem blocking a save, or null when the draft is saveable. */
export function validateDraft(
  draft: AutomationDraft,
  defs: Map<string, AvailableAction>,
): string | null {
  if (!draft.name.trim()) return "Give the automation a name before saving.";
  if (!draft.trigger) return "Choose a trigger — the event this automation reacts to.";
  for (const [i, action] of draft.actions.entries()) {
    if (!action.type) return `Step ${i + 1} needs an action.`;
    if (!isActionComplete(action, defs.get(action.type))) {
      return `Step ${i + 1} (${action.type}) is missing required configuration.`;
    }
  }
  return null;
}

export function draftToPayload(draft: AutomationDraft): {
  name: string;
  description?: string;
  trigger: string;
  actions: AutomationAction[];
} {
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    description: description || undefined,
    trigger: draft.trigger,
    actions: draft.actions.map((a) => ({ type: a.type, input: a.input })),
  };
}
