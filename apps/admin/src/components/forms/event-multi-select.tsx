"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import type { AutomationTriggerInfo } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function EventMultiSelect({
  id,
  value,
  onValueChange,
  events,
  placeholder = "Choose events",
  disabled,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string[];
  onValueChange: (value: string[]) => void;
  events: AutomationTriggerInfo[];
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const byType = useMemo(() => new Map(events.map((e) => [e.type, e])), [events]);
  const selected = useMemo(() => new Set(value), [value]);

  const groups = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found =
      terms.length === 0
        ? events
        : events.filter((e) =>
            terms.every((t) => `${e.label} ${e.type} ${e.category}`.toLowerCase().includes(t)),
          );
    const byCategory = new Map<string, AutomationTriggerInfo[]>();
    for (const event of found) {
      const bucket = byCategory.get(event.category);
      if (bucket) bucket.push(event);
      else byCategory.set(event.category, [event]);
    }
    return [...byCategory];
  }, [events, query]);

  const toggle = (type: string) => {
    onValueChange(selected.has(type) ? value.filter((v) => v !== type) : [...value, type]);
  };

  const toggleCategory = (items: AutomationTriggerInfo[]) => {
    const types = items.map((e) => e.type);
    const allSelected = types.every((t) => selected.has(t));
    onValueChange(
      allSelected
        ? value.filter((v) => !types.includes(v))
        : [...value, ...types.filter((t) => !selected.has(t))],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 text-sm text-ink outline-none transition-colors",
            "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
            "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
          )}
        >
          <span className={cn("truncate text-left", value.length === 0 && "text-ink-4")}>
            {value.length === 0
              ? placeholder
              : `${value.length} ${value.length === 1 ? "event" : "events"} selected`}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-3" />
        </PopoverTrigger>

        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0">
          <Command shouldFilter={false} loop>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search events…"
              autoFocus
            />
            <CommandList>
              <CommandEmpty>No events match</CommandEmpty>
              {groups.map(([category, items]) => {
                const allSelected = items.every((e) => selected.has(e.type));
                return (
                  <CommandGroup key={category} heading={category}>
                    <CommandItem value={`all:${category}`} onSelect={() => toggleCategory(items)}>
                      <span className="min-w-0 flex-1 truncate text-ink-3">
                        {allSelected ? "Clear" : "Select"} all in {category}
                      </span>
                      {allSelected ? <Check className="size-4 shrink-0 text-brand" /> : null}
                    </CommandItem>
                    {items.map((event) => (
                      <CommandItem
                        key={event.type}
                        value={event.type}
                        onSelect={() => toggle(event.type)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{event.label}</span>
                          <span className="block truncate font-mono text-xs text-ink-4">
                            {event.type}
                          </span>
                        </span>
                        {selected.has(event.type) ? (
                          <Check className="size-4 shrink-0 text-brand" />
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((type) => {
            const label = byType.get(type)?.label ?? type;
            return (
              <li key={type}>
                <Badge variant="outline" className="gap-1 pr-1" title={type}>
                  {label}
                  <button
                    type="button"
                    onClick={() => toggle(type)}
                    disabled={disabled}
                    aria-label={`Remove ${label}`}
                    className="rounded-full p-0.5 text-ink-3 outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <X />
                  </button>
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
