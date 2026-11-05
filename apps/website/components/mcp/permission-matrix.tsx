import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ABOUT_LABELS, FULL_ROLES, PARTIAL_ROLES, abouts, catalogue, listText } from "./catalogue";

export function PermissionMatrix() {
  const groups = abouts().map((about) => ({
    about,
    permissions: catalogue.permissions.filter((permission) => permission.about === about),
  }));
  const span = 2 + PARTIAL_ROLES.length;

  return (
    <div className="not-prose my-6 overflow-x-auto rounded-[12px] ring-1 ring-line">
      <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-[13.5px] leading-[1.4]">
        <colgroup>
          <col className="w-[30%]" />
          <col />
          {PARTIAL_ROLES.map((role) => (
            <col key={role} className="w-[13%]" />
          ))}
        </colgroup>
        <caption className="sr-only">
          Each permission, what it allows, and which default roles hold it
        </caption>
        <thead>
          <tr className="bg-surface-2">
            <th scope="col" className="px-3 py-2.5 font-medium text-foreground">
              Permission
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium text-foreground">
              Allows
            </th>
            {PARTIAL_ROLES.map((role) => (
              <th
                key={role}
                scope="col"
                className="px-3 py-2.5 text-center font-medium text-foreground"
              >
                {role}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.about}>
            <tr className="border-t border-line bg-surface-2/60">
              <th
                scope="colgroup"
                colSpan={span}
                className="px-3 py-2 text-[12.5px] font-medium text-muted-foreground"
              >
                {ABOUT_LABELS[group.about] ?? `About a ${group.about}`}
              </th>
            </tr>
            {group.permissions.map((permission) => (
              <tr
                key={permission.permission}
                id={`permission-${permission.permission.replace(":", "-")}`}
                className="scroll-mt-24 border-t border-line align-top"
              >
                <th scope="row" className="px-3 py-3 font-normal">
                  <div className="flex flex-col gap-0.5">
                    <code
                      className={cn(
                        "w-fit font-mono text-[11.5px] text-foreground",
                        permission.removes &&
                          "underline decoration-brand-coral decoration-2 underline-offset-4",
                      )}
                    >
                      {permission.resource}:
                      <wbr />
                      {permission.action}
                    </code>
                    <span className="text-[12.5px] font-medium text-foreground">
                      {permission.label}
                    </span>
                  </div>
                </th>
                <td className="px-3 py-3 text-body">{permission.description}</td>
                {PARTIAL_ROLES.map((role) => (
                  <td key={role} className="px-3 py-3 text-center">
                    {permission.roles.includes(role) ? (
                      <>
                        <Check
                          aria-hidden="true"
                          className="mx-auto size-4 text-foreground"
                          strokeWidth={2.25}
                        />
                        <span className="sr-only">Held</span>
                      </>
                    ) : (
                      <span className="sr-only">Not held</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <div className="flex flex-col gap-1.5 border-t border-line bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted-foreground">
        {FULL_ROLES.length > 0 && (
          <p>
            {listText(FULL_ROLES)} {FULL_ROLES.length === 1 ? "holds" : "hold"} every permission.
          </p>
        )}
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-[2px] w-4 shrink-0 rounded-full bg-brand-coral" />
          Underlined permissions delete something for good.
        </p>
      </div>
    </div>
  );
}
