"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, FileDown, Users, X, type LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ContentType } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Static lookup option source fetched by the Server Component and passed in. */
export type LiteContent = { id: string; title: string; type: ContentType };

const GROUPS: [string, ContentType][] = [
  ["Courses", "course"],
  ["Downloads", "download"],
  ["Communities", "community"],
];

const TYPE_ICON: Record<ContentType, LucideIcon> = {
  course: BookOpen,
  download: FileDown,
  community: Users,
};

/**
 * Multi-select picker for bundle content: a searchable course/download/community
 * listbox that stays open across toggles, with the selection listed underneath
 * as removable rows. Same trigger/list styling as `Combobox`.
 */
export function ContentMultiSelect({
  id,
  value,
  onValueChange,
  content,
  disabled,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string[];
  onValueChange: (value: string[]) => void;
  content: LiteContent[];
  disabled?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(content.map((c) => [c.id, c])), [content]);
  const selected = value.map((cid) => byId.get(cid)).filter((c): c is LiteContent => !!c);

  const groups = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found =
      terms.length === 0
        ? content
        : content.filter((c) => terms.every((t) => c.title.toLowerCase().includes(t)));
    return GROUPS.map(
      ([heading, type]) => [heading, found.filter((c) => c.type === type)] as const,
    ).filter(([, items]) => items.length > 0);
  }, [content, query]);

  const toggle = (contentId: string) => {
    onValueChange(
      value.includes(contentId) ? value.filter((v) => v !== contentId) : [...value, contentId],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {/* `modal` so the listbox stays interactive inside a dialog's focus trap. */}
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
          <span className={cn("truncate text-left", selected.length === 0 && "text-ink-4")}>
            {selected.length === 0
              ? "Add courses, downloads and communities"
              : `${selected.length} ${selected.length === 1 ? "item" : "items"} selected`}
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-3" />
        </PopoverTrigger>

        <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
          <Command shouldFilter={false} loop>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search courses, downloads and communities…"
              autoFocus
            />
            <CommandList>
              <CommandEmpty>No content matches</CommandEmpty>
              {groups.map(([heading, items]) => (
                <CommandGroup key={heading} heading={heading}>
                  {items.map((item) => {
                    const isSelected = value.includes(item.id);
                    return (
                      <CommandItem key={item.id} value={item.id} onSelect={() => toggle(item.id)}>
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {isSelected ? <Check className="size-4 shrink-0 text-brand" /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {selected.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <li key={item.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Icon className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  disabled={disabled}
                  aria-label={`Remove ${item.title}`}
                  className="rounded-sm p-0.5 text-ink-3 outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
