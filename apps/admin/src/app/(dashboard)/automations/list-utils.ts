import type { Automation, ListParams, Paginated } from "@/lib/api/types";

function compareBy(id: string, a: Automation, b: Automation): number {
  switch (id) {
    case "name":
      return a.name.localeCompare(b.name);
    case "trigger":
      return a.trigger.localeCompare(b.trigger);
    case "steps":
      return a.actions.length - b.actions.length;
    default:
      return 0;
  }
}

/** Search/facet/sort/slice the full automations set against `ListParams`. */
export function shapeAutomationsList(
  all: Automation[],
  params: ListParams,
): Paginated<Automation> {
  let rows = all;

  const q = params.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((a) =>
      [a.name, a.description ?? "", a.trigger, ...a.actions.map((x) => x.type)].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }

  const enabledFilter = params.filters?.enabled;
  if (enabledFilter?.length) {
    rows = rows.filter((a) => enabledFilter.includes(a.enabled ? "true" : "false"));
  }
  const triggerFilter = params.filters?.trigger;
  if (triggerFilter?.length) {
    rows = rows.filter((a) => triggerFilter.includes(a.trigger));
  }

  const sort = params.sort ?? [];
  if (sort.length) {
    rows = [...rows].sort((a, b) => {
      for (const s of sort) {
        const cmp = compareBy(s.id, a, b);
        if (cmp !== 0) return s.desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  const start = (params.page - 1) * params.pageSize;
  return {
    rows: rows.slice(start, start + params.pageSize),
    total: rows.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}
