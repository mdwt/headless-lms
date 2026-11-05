"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  RESOURCE_LABELS,
  ROLES,
  catalogue,
  resources,
  toolResources,
  type Tool,
} from "./catalogue";
import { KindMark } from "./kind-mark";

const ALL_PERMISSIONS = catalogue.permissions.map((entry) => entry.permission);
const READ_PERMISSIONS = ALL_PERMISSIONS.filter((permission) => permission.endsWith(":read"));

function holds(role: string, permission: string): boolean {
  return (
    catalogue.permissions.find((entry) => entry.permission === permission)?.roles.includes(role) ??
    false
  );
}

function effective(role: string, granted: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const permission of granted) {
    if (!holds(role, permission)) {
      continue;
    }
    out.add(permission);
    const [resource, action] = permission.split(":");
    const read = `${resource}:read`;
    if ((action === "write" || action === "delete") && holds(role, read)) {
      out.add(read);
    }
  }
  return out;
}

function listed(tool: Tool, held: Set<string>): boolean {
  if (tool.permissions.length === 0) {
    return held.size > 0;
  }
  return tool.permissions.some((permission) => held.has(permission));
}

function matches(tool: Tool, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    tool.name,
    tool.title,
    tool.description,
    tool.operation,
    ...tool.permissions,
    RESOURCE_LABELS[tool.resource] ?? tool.resource,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function ToolCatalogue() {
  const searchId = useId();
  const permissionsId = useId();
  const [choosing, setChoosing] = useState(false);
  const [custom, setCustom] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string>(ROLES[0] ?? "");
  const [granted, setGranted] = useState<Set<string>>(() => new Set(ALL_PERMISSIONS));

  const visible = useMemo(() => {
    const held = effective(role, granted);
    return catalogue.tools.filter((tool) => listed(tool, held) && matches(tool, query.trim()));
  }, [granted, role, query]);

  const groups = useMemo(
    () =>
      toolResources()
        .map((resource) => ({
          resource,
          tools: visible.filter((tool) => tool.resource === resource),
        }))
        .filter((group) => group.tools.length > 0),
    [visible],
  );

  const preset =
    granted.size === ALL_PERMISSIONS.length
      ? "all"
      : granted.size === READ_PERMISSIONS.length &&
          READ_PERMISSIONS.every((permission) => granted.has(permission))
        ? "defaults"
        : "custom";

  const toggle = (permission: string) => {
    setCustom(true);
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return next;
    });
  };

  return (
    <div className="not-prose my-8">
      <div className="rounded-[14px] bg-surface-2 p-4 ring-1 ring-line md:p-5">
        <label htmlFor={searchId} className="text-[13px] font-medium text-foreground">
          Search tools
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, area or what it does"
          className="mt-1.5 h-10 w-full rounded-[9px] bg-raised px-3 text-[14px] text-foreground ring-1 ring-line outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
          <Segmented
            legend="Signed in as"
            name="mcp-role"
            value={role}
            options={ROLES.map((entry) => ({ value: entry, label: entry }))}
            onChange={setRole}
          />
          <Segmented
            legend="Permissions granted"
            name="mcp-permissions"
            value={custom ? "custom" : preset}
            options={[
              { value: "all", label: "All" },
              { value: "defaults", label: "Consent defaults" },
              { value: "custom", label: "Custom" },
            ]}
            onChange={(value) => {
              if (value === "all") {
                setGranted(new Set(ALL_PERMISSIONS));
              }
              if (value === "defaults") {
                setGranted(new Set(READ_PERMISSIONS));
              }
              setCustom(value === "custom");
              if (value === "custom") {
                setChoosing(true);
              }
            }}
          />
          <button
            type="button"
            aria-expanded={choosing}
            aria-controls={permissionsId}
            onClick={() => setChoosing((open) => !open)}
            className="h-[42px] rounded-[8px] px-1 text-[13px] text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {choosing ? "Hide permissions" : "Choose permissions"}
          </button>
        </div>

        <fieldset id={permissionsId} hidden={!choosing} className="mt-5 border-t border-line pt-4">
          <legend className="sr-only">Permissions granted to the connection</legend>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {resources().map((resource) => (
              <div key={resource}>
                <div className="text-[13px] font-medium text-foreground">
                  {RESOURCE_LABELS[resource] ?? resource}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {catalogue.permissions
                    .filter((entry) => entry.resource === resource)
                    .map((entry) => {
                      const allowed = holds(role, entry.permission);
                      return (
                        <label
                          key={entry.permission}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[13px]",
                            allowed ? "cursor-pointer text-body" : "text-faint",
                          )}
                          title={
                            allowed
                              ? `${entry.permission}: ${entry.label}`
                              : `${role} doesn't hold ${entry.permission}`
                          }
                        >
                          <input
                            type="checkbox"
                            checked={allowed && granted.has(entry.permission)}
                            disabled={!allowed}
                            onChange={() => toggle(entry.permission)}
                            className="size-3.5 accent-[var(--ink)] dark:accent-[var(--paper)]"
                          />
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </label>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {visible.length === catalogue.tools.length
            ? `All ${catalogue.tools.length} tools`
            : `${visible.length} of ${catalogue.tools.length} tools for this connection`}
        </p>
        <div className="flex gap-4">
          <KindMark kind="read" />
          <KindMark kind="write" />
          <KindMark kind="destructive" />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-6 rounded-[12px] px-4 py-6 text-center text-[14px] text-body ring-1 ring-line">
          No tool matches. Clear the search or grant more permissions.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.resource} className="mt-8">
            <h3 className="text-[15px] font-semibold text-foreground">
              {RESOURCE_LABELS[group.resource] ?? group.resource}
            </h3>
            <ul className="mt-3 divide-y divide-line rounded-[12px] ring-1 ring-line">
              {group.tools.map((tool) => (
                <ToolRow key={tool.name} tool={tool} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ToolRow({ tool }: { tool: Tool }) {
  return (
    <li id={`tool-${tool.name}`} className="scroll-mt-24 px-4 py-3.5">
      <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0 flex-1">
          <code className="font-mono text-[13.5px] font-medium text-foreground">{tool.name}</code>
          <p className="mt-1 max-w-[68ch] text-[14px] leading-[1.55] text-body">
            {tool.description}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-4 md:grid md:w-[300px] md:grid-cols-[88px_minmax(0,1fr)] md:pt-0.5">
          <KindMark kind={tool.kind} />
          <ToolPermissions permissions={tool.permissions} />
        </div>
      </div>

      {(tool.openWorld || tool.fields.length > 0) && (
        <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
          {tool.openWorld && (
            <span className="text-[12.5px] text-muted-foreground">
              Reaches outside the LMS: sends email or runs workflow actions
            </span>
          )}
          {tool.fields.length > 0 && (
            <details className="group/inputs w-full">
              <summary className="w-fit cursor-pointer list-none rounded-[6px] text-[12.5px] text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="group-open/inputs:hidden">Show inputs ({tool.fields.length})</span>
                <span className="hidden group-open/inputs:inline">Hide inputs</span>
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] table-fixed text-left text-[12.5px]">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[34%]" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="text-muted-foreground">
                      <th scope="col" className="py-1 pr-4 font-normal">
                        Field
                      </th>
                      <th scope="col" className="py-1 pr-4 font-normal">
                        Type
                      </th>
                      <th scope="col" className="py-1 font-normal">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tool.fields.map((field) => (
                      <tr key={field.name} className="border-t border-line-soft align-top">
                        <td className="py-1.5 pr-4">
                          <code className="font-mono text-foreground">{field.name}</code>
                        </td>
                        <td className="py-1.5 pr-4">
                          <code className="font-mono break-all text-body">{field.type}</code>
                        </td>
                        <td className="py-1.5 text-body">
                          {[field.required ? "Required." : "Optional.", field.description]
                            .filter(Boolean)
                            .join(" ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

function ToolPermissions({ permissions }: { permissions: string[] }) {
  if (permissions.length === 0) {
    return <span className="text-[12.5px] text-muted-foreground">Any member</span>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {permissions.length > 1 && <span className="text-[12px] text-muted-foreground">Any of</span>}
      {permissions.map((permission) => (
        <code key={permission} className="font-mono text-[12px] text-muted-foreground">
          {permission}
        </code>
      ))}
    </div>
  );
}

function Segmented({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[13px] text-muted-foreground">{legend}</legend>
      <div className="mt-1.5 inline-flex rounded-[9px] bg-raised p-1 ring-1 ring-line">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-[6px] px-3 py-1.5 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none",
              value === option.value
                ? "bg-inverse text-inverse-foreground"
                : "text-body hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
