import { cn } from "@/lib/utils";
import { RESOURCE_LABELS, catalogue, resources, rolesLabel } from "./catalogue";

const COLUMNS = [
  { label: "View", actions: ["read"] },
  { label: "Change", actions: ["write"] },
  { label: "Delete", actions: ["delete"] },
  { label: "Invite, moderate", actions: ["invite", "moderate"] },
];

export function ScopeMatrix() {
  const rows = resources();

  return (
    <div className="not-prose my-6 overflow-x-auto rounded-[12px] ring-1 ring-line">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[13.5px] leading-[1.4]">
        <colgroup>
          <col className="w-[17%]" />
          <col className="w-[23%]" />
          <col className="w-[23%]" />
          <col className="w-[19%]" />
          <col className="w-[18%]" />
        </colgroup>
        <caption className="sr-only">
          Each scope, the role that can grant it, and whether its tools can remove things
        </caption>
        <thead>
          <tr className="bg-surface-2">
            <th scope="col" className="px-3 py-2.5 font-medium text-foreground">
              Area
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className="px-3 py-2.5 font-medium text-foreground"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((resource) => (
            <tr key={resource} className="border-t border-line align-top">
              <th scope="row" className="px-3 py-3 font-medium text-foreground">
                {RESOURCE_LABELS[resource] ?? resource}
              </th>
              {COLUMNS.map((column) => {
                const scope = catalogue.scopes.find(
                  (s) => s.resource === resource && column.actions.includes(s.action),
                );
                return (
                  <td key={column.label} className="px-3 py-3">
                    {scope ? (
                      <div className="flex flex-col gap-0.5">
                        <code
                          className={cn(
                            "w-fit font-mono text-[11.5px] text-foreground",
                            scope.removes &&
                              "underline decoration-brand-coral decoration-2 underline-offset-4",
                          )}
                        >
                          {scope.resource}:
                          <wbr />
                          {scope.action}
                        </code>
                        <span className="text-[12.5px] text-muted-foreground">
                          {rolesLabel(scope.roles)}
                        </span>
                      </div>
                    ) : (
                      <span className="sr-only">None</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center gap-2 border-t border-line bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted-foreground">
        <span aria-hidden="true" className="h-[2px] w-4 shrink-0 rounded-full bg-brand-coral" />
        Underlined scopes include tools that remove or revoke something.
      </p>
    </div>
  );
}
