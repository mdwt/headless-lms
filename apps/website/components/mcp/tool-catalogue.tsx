"use client";

import { useId, useMemo, useState } from "react";
import { catalogue, type Tool } from "./catalogue";
import { KindMark } from "./kind-mark";

const GROUPS = [...new Set(catalogue.tools.map((tool) => tool.group))];

function matches(tool: Tool, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [tool.name, tool.title, tool.description, tool.group].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function ToolCatalogue() {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => catalogue.tools.filter((tool) => matches(tool, query.trim())),
    [query],
  );

  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        tools: visible.filter((tool) => tool.group === group),
      })).filter((entry) => entry.tools.length > 0),
    [visible],
  );

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
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {visible.length === catalogue.tools.length
            ? `All ${catalogue.tools.length} tools`
            : `${visible.length} of ${catalogue.tools.length} tools`}
        </p>
        <div className="flex gap-4">
          <KindMark kind="read" />
          <KindMark kind="write" />
          <KindMark kind="destructive" />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-6 rounded-[12px] px-4 py-6 text-center text-[14px] text-body ring-1 ring-line">
          No tool matches. Clear the search.
        </p>
      ) : (
        groups.map((entry) => (
          <section key={entry.group} className="mt-8">
            <h3 className="text-[15px] font-semibold text-foreground">{entry.group}</h3>
            <ul className="mt-3 divide-y divide-line rounded-[12px] ring-1 ring-line">
              {entry.tools.map((tool) => (
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
        <div className="flex shrink-0 items-start md:pt-0.5">
          <KindMark kind={tool.kind} />
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
