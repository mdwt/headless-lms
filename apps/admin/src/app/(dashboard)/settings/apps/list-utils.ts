import type { ListParams, OrgApp, Paginated } from "@/lib/api/types";

export function hostOf(domain: string): string {
  return URL.canParse(domain) ? new URL(domain).host : domain;
}

function compareBy(id: string, a: OrgApp, b: OrgApp): number {
  switch (id) {
    case "name":
      return a.name.localeCompare(b.name);
    case "domain":
      return hostOf(a.domain).localeCompare(hostOf(b.domain));
    case "slug":
      return a.slug.localeCompare(b.slug);
    default:
      return 0;
  }
}

export function shapeAppsList(all: OrgApp[], params: ListParams): Paginated<OrgApp> {
  let rows = all;

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
