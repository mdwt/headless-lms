"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { ChevronDown, ChevronUp, MousePointerClick, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchemaFields, schemaDefaults } from "@/components/forms/schema-fields";
import type { AutomationAction, AutomationTriggerInfo, AvailableAction } from "@/lib/api/types";
import type { AutomationDraft, EditorSelection } from "./draft";

interface ConfigPanelProps {
  draft: AutomationDraft;
  selection: EditorSelection;
  triggers: AutomationTriggerInfo[];
  availableActions: AvailableAction[];
  defs: Map<string, AvailableAction>;
  onTriggerChange: (trigger: string) => void;
  onActionTypeChange: (index: number, type: string) => void;
  onActionInputChange: (index: number, input: Record<string, unknown>) => void;
  onMoveStep: (index: number, delta: -1 | 1) => void;
  onRemoveStep: (index: number) => void;
}

/** Right-hand configuration for whatever is selected on the canvas. */
export function ConfigPanel(props: ConfigPanelProps) {
  const { selection, draft } = props;
  if (!selection) return <EmptyPanel />;
  if (selection.kind === "trigger") return <TriggerPanel {...props} />;
  const action = draft.actions[selection.index];
  if (!action) return <EmptyPanel />;
  return (
    // Keyed so switching step or action type remounts the input form with fresh defaults.
    <ActionPanel key={`${selection.index}:${action.type}`} {...props} index={selection.index} action={action} />
  );
}

function EmptyPanel() {
  return (
    <div className="grid h-full min-h-[200px] place-items-center p-6 text-center">
      <div className="flex max-w-[220px] flex-col items-center gap-2">
        <MousePointerClick className="size-5 text-ink-4" />
        <p className="text-sm text-ink-3">Select the trigger or a step on the canvas to configure it.</p>
      </div>
    </div>
  );
}

function PanelHeading({ overline, title }: { overline: string; title: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-medium tracking-wide text-ink-4 uppercase">{overline}</div>
      <div className="text-sm font-semibold text-ink">{title}</div>
    </div>
  );
}

function TriggerPanel({ draft, triggers, onTriggerChange }: ConfigPanelProps) {
  const selected = triggers.find((t) => t.type === draft.trigger);
  return (
    <div className="flex flex-col gap-5 p-5">
      <PanelHeading overline="Trigger" title="When this happens" />
      <Field id="trigger" label="Event" required>
        <Select value={draft.trigger || undefined} onValueChange={onTriggerChange}>
          <SelectTrigger id="trigger">
            <SelectValue placeholder="Choose an event" />
          </SelectTrigger>
          <SelectContent>
            {triggers.map((t) => (
              <SelectItem key={t.type} value={t.type} textValue={t.type}>
                <div className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">{t.type}</span>
                  <span className="text-xs text-ink-3">{t.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {selected ? <p className="text-sm text-ink-3">Runs when {selected.description}.</p> : null}
    </div>
  );
}

function ActionPanel({
  draft,
  availableActions,
  defs,
  index,
  action,
  onActionTypeChange,
  onActionInputChange,
  onMoveStep,
  onRemoveStep,
}: ConfigPanelProps & { index: number; action: AutomationAction }) {
  const def = defs.get(action.type);
  const count = draft.actions.length;

  const groups = React.useMemo(() => {
    const bySource = new Map<string, AvailableAction[]>();
    for (const a of availableActions) {
      const list = bySource.get(a.source) ?? [];
      list.push(a);
      bySource.set(a.source, list);
    }
    return [...bySource.entries()];
  }, [availableActions]);

  const onInputChange = React.useCallback(
    (input: Record<string, unknown>) => onActionInputChange(index, input),
    [onActionInputChange, index],
  );

  const hasInputs =
    !!def &&
    Object.keys((def.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})
      .length > 0;

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-2">
        <PanelHeading overline={`Step ${index + 1}`} title="Do this" />
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMoveStep(index, -1)}
            disabled={index === 0}
            aria-label="Move step up"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMoveStep(index, 1)}
            disabled={index === count - 1}
            aria-label="Move step down"
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemoveStep(index)}
            aria-label="Remove step"
            className="text-danger hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <Field id="action-type" label="Action" required>
        <Select value={action.type || undefined} onValueChange={(t) => onActionTypeChange(index, t)}>
          <SelectTrigger id="action-type">
            <SelectValue placeholder="Choose an action" />
          </SelectTrigger>
          <SelectContent>
            {groups.map(([source, actions]) => (
              <SelectGroup key={source}>
                <SelectLabel>
                  {source === "system"
                    ? "Built-in"
                    : source.charAt(0).toUpperCase() + source.slice(1)}
                </SelectLabel>
                {actions.map((a) => (
                  <SelectItem key={a.type} value={a.type} textValue={a.type}>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">{a.type}</span>
                      <span className="text-xs text-ink-3">{a.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {!def ? (
        <p className="text-sm text-ink-4">Choose an action to configure it.</p>
      ) : hasInputs ? (
        <ActionInputForm def={def} input={action.input} onChange={onInputChange} />
      ) : (
        <p className="text-sm text-ink-4">This action needs no configuration.</p>
      )}
    </div>
  );
}

/** Schema-rendered inputs for the step, synced back to the draft as they change. */
function ActionInputForm({
  def,
  input,
  onChange,
}: {
  def: AvailableAction;
  input: Record<string, unknown>;
  onChange: (input: Record<string, unknown>) => void;
}) {
  const { control, watch } = useForm<{ input: Record<string, unknown> }>({
    defaultValues: { input: schemaDefaults(def.inputSchema, input) },
  });

  React.useEffect(() => {
    const sub = watch((values) => onChange({ ...(values.input as Record<string, unknown>) }));
    return () => sub.unsubscribe();
  }, [watch, onChange]);

  return (
    <div className="flex flex-col gap-4">
      <SchemaFields schema={def.inputSchema} control={control} namePrefix="input" />
    </div>
  );
}
