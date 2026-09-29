"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import type { AutomationTriggerInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function TriStateCheckbox({
  checked,
  indeterminate,
  ...props
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <Checkbox
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      checked={checked}
      {...props}
    />
  );
}

export function EventChecklist({
  id,
  value,
  onValueChange,
  events,
  disabled,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string[];
  onValueChange: (value: string[]) => void;
  events: AutomationTriggerInfo[];
  disabled?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return events;
    return events.filter((e) =>
      terms.every((t) => `${e.label} ${e.type} ${e.category}`.toLowerCase().includes(t)),
    );
  }, [events, query]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, AutomationTriggerInfo[]>();
    for (const event of visible) {
      const bucket = byCategory.get(event.category);
      if (bucket) bucket.push(event);
      else byCategory.set(event.category, [event]);
    }
    return [...byCategory];
  }, [visible]);

  const setMany = (types: string[], on: boolean) => {
    onValueChange(
      on
        ? [...value, ...types.filter((t) => !selected.has(t))]
        : value.filter((v) => !types.includes(v)),
    );
  };

  const stateOf = (items: AutomationTriggerInfo[]) => {
    const count = items.filter((e) => selected.has(e.type)).length;
    return {
      checked: count > 0 && count === items.length,
      indeterminate: count > 0 && count < items.length,
    };
  };

  const visibleTypes = visible.map((e) => e.type);
  const all = stateOf(visible);

  return (
    <div
      id={id}
      aria-invalid={ariaInvalid}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-input bg-surface",
        ariaInvalid && "border-danger",
      )}
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-4 shrink-0 text-ink-4" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          disabled={disabled}
          aria-label="Search events"
          className="h-9 w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4 max-sm:text-base"
        />
      </div>

      <label className="flex items-center gap-3 border-b border-line bg-surface-2 px-3 py-2 text-sm">
        <TriStateCheckbox
          checked={all.checked}
          indeterminate={all.indeterminate}
          onChange={() => setMany(visibleTypes, !all.checked)}
          disabled={disabled || visible.length === 0}
          aria-label={query ? "Select all matching events" : "Select all events"}
        />
        <span className="flex-1 font-medium text-ink">
          {query ? "Select all matching" : "Select all"}
        </span>
        <span className="text-ink-4 tabular-nums">
          {value.length} of {events.length} selected
        </span>
      </label>

      <div className="max-h-72 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-4">No events match</p>
        ) : (
          groups.map(([category, items]) => {
            const state = stateOf(items);
            return (
              <fieldset key={category} className="border-b border-line last:border-b-0">
                <legend className="sr-only">{category}</legend>
                <label className="flex items-center gap-3 px-3 pt-3 pb-1.5 text-xs font-medium tracking-wide text-ink-3 uppercase">
                  <TriStateCheckbox
                    checked={state.checked}
                    indeterminate={state.indeterminate}
                    onChange={() =>
                      setMany(
                        items.map((e) => e.type),
                        !state.checked,
                      )
                    }
                    disabled={disabled}
                    aria-label={`Select all in ${category}`}
                  />
                  {category}
                </label>
                <ul className="pb-1.5">
                  {items.map((event) => (
                    <li key={event.type}>
                      <label className="flex cursor-pointer items-start gap-3 py-1.5 pr-3 pl-10 hover:bg-surface-2">
                        <span className="mt-0.5 flex">
                          <Checkbox
                            checked={selected.has(event.type)}
                            onChange={() => setMany([event.type], !selected.has(event.type))}
                            disabled={disabled}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{event.label}</span>
                          <span className="block truncate font-mono text-xs text-ink-4">
                            {event.type}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })
        )}
      </div>
    </div>
  );
}
