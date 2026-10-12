"use client";

import { useId } from "react";
import { AlertTriangle } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  isDeleteScope,
  SCOPE_ACTION_LABELS,
  SCOPE_NOTES,
  SCOPE_RESOURCES,
} from "@/lib/auth/oauth-flow";

export function ScopePicker({
  scopes,
  value,
  onChange,
}: {
  scopes: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const selected = new Set(value);

  const toggle = (scope: string) =>
    onChange(selected.has(scope) ? value.filter((item) => item !== scope) : [...value, scope]);

  const groups = SCOPE_RESOURCES.map(({ resource, label }) => ({
    resource,
    label,
    scopes: scopes.filter((scope) => scope.startsWith(`${resource}:`) && !isDeleteScope(scope)),
  })).filter((group) => group.scopes.length > 0);

  const deletable = SCOPE_RESOURCES.flatMap(({ resource, label }) =>
    scopes
      .filter((scope) => scope.startsWith(`${resource}:`) && isDeleteScope(scope))
      .map((scope) => ({ scope, label })),
  );

  const option = (scope: string, text: string) => (
    <label
      key={scope}
      htmlFor={`${id}-${scope}`}
      className="flex items-center gap-2.5 text-sm text-ink-2"
    >
      <Checkbox
        id={`${id}-${scope}`}
        checked={selected.has(scope)}
        onChange={() => toggle(scope)}
      />
      {text}
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div
              key={group.resource}
              role="group"
              aria-labelledby={`${id}-${group.resource}`}
              className="flex items-start gap-4"
            >
              <span
                id={`${id}-${group.resource}`}
                className="w-24 shrink-0 text-sm font-medium text-ink"
              >
                {group.label}
              </span>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {group.scopes.map((scope) =>
                    option(
                      scope,
                      SCOPE_ACTION_LABELS[scope.slice(group.resource.length + 1)] ?? scope,
                    ),
                  )}
                </div>
                {group.scopes
                  .filter((scope) => SCOPE_NOTES[scope])
                  .map((scope) => (
                    <p key={`${scope}-note`} className="text-xs text-ink-3">
                      {SCOPE_NOTES[scope]}
                    </p>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {deletable.length > 0 && (
        <div role="group" aria-labelledby={`${id}-delete`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span id={`${id}-delete`} className="text-sm font-medium text-ink">
              Delete
            </span>
            <p className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Lets the app permanently delete what you tick.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {deletable.map(({ scope, label }) => option(scope, label))}
          </div>
        </div>
      )}
    </div>
  );
}
