"use client";

import { useId } from "react";
import { AlertTriangle } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { isDeleteScope, SCOPE_NOTES } from "@/lib/auth/oauth-flow";
import { permissionGroupLabel, type PermissionDefinition } from "@/lib/permissions";

export function ScopePicker({
  permissions,
  value,
  onChange,
}: {
  permissions: PermissionDefinition[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const selected = new Set(value);

  const toggle = (scope: string) =>
    onChange(selected.has(scope) ? value.filter((item) => item !== scope) : [...value, scope]);

  const groups = [
    ...Map.groupBy(
      permissions.filter((p) => !isDeleteScope(p.key)),
      (p) => p.group,
    ),
  ].map(([group, items]) => ({ group, label: permissionGroupLabel(group), items }));
  const deletable = permissions.filter((p) => isDeleteScope(p.key));

  const option = (permission: PermissionDefinition) => (
    <label
      key={permission.key}
      htmlFor={`${id}-${permission.key}`}
      title={permission.description}
      className="flex items-center gap-2.5 text-sm text-ink-2"
    >
      <Checkbox
        id={`${id}-${permission.key}`}
        checked={selected.has(permission.key)}
        onChange={() => toggle(permission.key)}
      />
      {permission.label}
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div
              key={group.group}
              role="group"
              aria-labelledby={`${id}-${group.group}`}
              className="flex items-start gap-4"
            >
              <span
                id={`${id}-${group.group}`}
                className="w-28 shrink-0 text-sm font-medium text-ink"
              >
                {group.label}
              </span>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-x-4 gap-y-2">{group.items.map(option)}</div>
                {group.items
                  .filter((p) => SCOPE_NOTES[p.key])
                  .map((p) => (
                    <p key={`${p.key}-note`} className="text-xs text-ink-3">
                      {p.label}: {SCOPE_NOTES[p.key]}
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
          <div className="flex flex-wrap gap-x-4 gap-y-2">{deletable.map(option)}</div>
        </div>
      )}
    </div>
  );
}
