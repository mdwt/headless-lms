import type { ListParams, Paginated, Webhook } from "@/lib/api/types";

function compareBy(id: string, a: Webhook, b: Webhook): number {
  switch (id) {
    case "url":
      return a.url.localeCompare(b.url);
    case "events":
      return a.events.length - b.events.length;
    default:
      return 0;
  }
}

export function shapeWebhooksList(all: Webhook[], params: ListParams): Paginated<Webhook> {
  let rows = all;

  const q = params.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((w) =>
      [w.url, w.description ?? "", ...w.events].some((v) => v.toLowerCase().includes(q)),
    );
  }

  const enabledFilter = params.filters?.enabled;
  if (enabledFilter?.length) {
    rows = rows.filter((w) => enabledFilter.includes(w.enabled ? "true" : "false"));
  }
  const eventFilter = params.filters?.events;
  if (eventFilter?.length) {
    rows = rows.filter((w) => w.events.some((e) => eventFilter.includes(e)));
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
