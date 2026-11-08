import { sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  EventAnalytics,
  EventAttendeeSource,
  MemberEventsQuery,
  Page,
} from "@headless-lms/core/types";
import { eventSettingsDefaults } from "@headless-lms/core/schemas";
import type {
  EventAttendeeRow,
  EventFaces,
  EventReader,
} from "@headless-lms/core/reporting/events";
import { oneOf } from "./grant-covers.js";
import { SETTINGS_NAMESPACE } from "./content.js";

function attendance(orgId: string, eventIds: string[]): SQL {
  return sql`
    select ca.content_id, ca.org_user_id,
      max(case when e.content_id is not null then e.source end) as direct_source,
      min(case when e.content_id is not null then ca.granted_at end) as direct_at,
      min(ca.granted_at) as any_at
    from content_access ca
    join entitlements e on e.org_id = ca.org_id and e.id = ca.entitlement_id
    where ca.org_id = ${orgId} and ${oneOf(sql`ca.content_id`, eventIds)}
    group by ca.content_id, ca.org_user_id
  `;
}

const DISPLAY_NAME = sql`coalesce(
  nullif(trim(up.display_name), ''),
  nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '')
)`;

const SOURCE = sql`case
  when a.direct_source in ('self', 'automation') then a.direct_source
  when a.direct_source is not null then 'manual'
  else 'bundle'
end`;

export async function eventAttendeePage(
  db: NodePgDatabase,
  orgId: string,
  eventId: string,
  page: { page: number; pageSize: number },
): Promise<Page<EventAttendeeRow>> {
  const result = await db.execute(sql`
    with a as (${attendance(orgId, [eventId])})
    select a.org_user_id,
      ${DISPLAY_NAME} as display_name,
      case when up.image_asset_org_id = ${orgId} then up.image_asset_id end as image_asset_id,
      ${SOURCE} as source,
      coalesce(a.direct_at, a.any_at) as granted_at,
      count(*) over () as total
    from a
    join org_users ou on ou.org_id = ${orgId} and ou.id = a.org_user_id
    left join users u on u.id = ou.user_id
    left join user_profiles up on up.user_id = ou.user_id
    order by coalesce(a.direct_at, a.any_at), a.org_user_id
    limit ${page.pageSize}
    offset ${(page.page - 1) * page.pageSize}
  `);
  const rows = result.rows as {
    org_user_id: string;
    display_name: string | null;
    image_asset_id: string | null;
    source: EventAttendeeSource;
    granted_at: Date | string;
    total: string | number;
  }[];
  const total =
    rows.length > 0 || page.page === 1
      ? Number(rows[0]?.total ?? 0)
      : await eventAttendeeCount(db, orgId, eventId);
  return {
    rows: rows.map((row) => ({
      orgUserId: row.org_user_id,
      displayName: row.display_name,
      imageAssetId: row.image_asset_id,
      source: row.source,
      grantedAt: new Date(row.granted_at),
    })),
    total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

async function eventAttendeeCount(
  db: NodePgDatabase,
  orgId: string,
  eventId: string,
): Promise<number> {
  const result = await db.execute(sql`
    select count(distinct ca.org_user_id) as total
    from content_access ca
    where ca.org_id = ${orgId} and ca.content_id = ${eventId}
  `);
  return Number((result.rows[0] as { total: string | number } | undefined)?.total ?? 0);
}

export async function eventAnalyticsFigures(
  db: NodePgDatabase,
  orgId: string,
  eventId: string,
  startsAt: Date,
): Promise<Omit<EventAnalytics, "capacity">> {
  const [sources, revoked, overTime] = await Promise.all([
    db.execute(sql`
      with a as (${attendance(orgId, [eventId])})
      select ${SOURCE} as source, count(*) as count from a group by 1
    `),
    db.execute(sql`
      select count(*) as count from entitlements e
      where e.org_id = ${orgId} and e.content_id = ${eventId} and e.status = 'revoked'
    `),
    db.execute(sql`
      select to_char((e.granted_at at time zone 'utc')::date, 'YYYY-MM-DD') as date,
        count(*) as count
      from entitlements e
      where e.org_id = ${orgId}
        and e.content_id = ${eventId}
        and e.status = 'active'
        and (e.expires_at is null or e.expires_at > now())
        and e.granted_at < ${startsAt}
      group by 1
      order by 1
    `),
  ]);
  const bySource = { self: 0, manual: 0, automation: 0, bundle: 0 };
  for (const row of sources.rows as { source: EventAttendeeSource; count: string | number }[]) {
    bySource[row.source] = Number(row.count);
  }
  return {
    attendees: bySource.self + bySource.manual + bySource.automation + bySource.bundle,
    bySource,
    revoked: Number((revoked.rows[0] as { count: string | number } | undefined)?.count ?? 0),
    grantsOverTime: (overTime.rows as { date: string; count: string | number }[]).map((row) => ({
      date: row.date,
      count: Number(row.count),
    })),
  };
}

export async function eventFacesFor(
  db: NodePgDatabase,
  orgId: string,
  eventIds: string[],
  limit: number,
): Promise<Record<string, EventFaces>> {
  const faces: Record<string, EventFaces> = Object.fromEntries(
    eventIds.map((id) => [id, { total: 0, rows: [] }]),
  );
  if (eventIds.length === 0) {
    return faces;
  }
  const result = await db.execute(sql`
    with a as (${attendance(orgId, eventIds)}),
    ranked as (
      select a.content_id, a.org_user_id,
        ${DISPLAY_NAME} as display_name,
        case when up.image_asset_org_id = ${orgId} then up.image_asset_id end as image_asset_id,
        row_number() over (
          partition by a.content_id
          order by coalesce(a.direct_at, a.any_at), a.org_user_id
        ) as position,
        count(*) over (partition by a.content_id) as total
      from a
      join org_users ou on ou.org_id = ${orgId} and ou.id = a.org_user_id
      left join users u on u.id = ou.user_id
      left join user_profiles up on up.user_id = ou.user_id
    )
    select content_id, org_user_id, display_name, image_asset_id, total
    from ranked
    where position <= ${limit}
    order by content_id, position
  `);
  for (const row of result.rows as {
    content_id: string;
    org_user_id: string;
    display_name: string | null;
    image_asset_id: string | null;
    total: string | number;
  }[]) {
    const entry = faces[row.content_id];
    if (!entry) {
      continue;
    }
    entry.total = Number(row.total);
    entry.rows.push({
      orgUserId: row.org_user_id,
      displayName: row.display_name,
      imageAssetId: row.image_asset_id,
    });
  }
  return faces;
}

export async function directEventGrantIds(
  db: NodePgDatabase,
  orgId: string,
  orgUserId: string,
  eventIds: string[],
): Promise<string[]> {
  const result = await db.execute(sql`
    select distinct e.content_id from entitlements e
    where e.org_id = ${orgId}
      and e.org_user_id = ${orgUserId}
      and ${oneOf(sql`e.content_id`, eventIds)}
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  `);
  return (result.rows as { content_id: string }[]).map((row) => row.content_id);
}

export async function memberEventIds(
  db: NodePgDatabase,
  orgId: string,
  query: MemberEventsQuery,
  reader: EventReader,
  now: Date,
): Promise<Page<string>> {
  const attends = sql`exists (
    select 1 from content_access ca
    where ca.org_id = ev.org_id and ca.content_id = ev.id and ca.org_user_id = ${reader.orgUserId}
  )`;
  const sees = reader.readAll
    ? sql`true`
    : sql`(
        ${oneOf(sql`ev.id`, reader.readIds)}
        or (ev.status = 'published' and coalesce(s.value ->> 'type', ${eventSettingsDefaults.type}) = 'public')
        or ${attends}
      )`;
  const past = query.when === "past";
  const where = sql`
    ev.org_id = ${orgId}
    and ev.status in ('published', 'canceled')
    and ${sees}
    and ${query.attending ? attends : sql`true`}
    and ${past ? sql`ev.ends_at <= ${now}` : sql`ev.ends_at > ${now}`}
  `;
  const from = sql`
    from events ev
    left join settings s on s.org_id = ev.org_id and s.namespace = ${SETTINGS_NAMESPACE} and s.scope_id = ev.id
  `;
  const order = past ? sql`ev.starts_at desc, ev.id desc` : sql`ev.starts_at asc, ev.id asc`;
  const [rows, totals] = await Promise.all([
    db.execute(sql`
      select ev.id ${from} where ${where} order by ${order}
      limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}
    `),
    db.execute(sql`select count(*) as total ${from} where ${where}`),
  ]);
  return {
    rows: (rows.rows as { id: string }[]).map((row) => row.id),
    total: Number((totals.rows[0] as { total: string | number } | undefined)?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function upcomingEventCount(db: NodePgDatabase, orgId: string): Promise<number> {
  const result = await db.execute(sql`
    select count(*) as total from events ev
    where ev.org_id = ${orgId} and ev.status = 'published' and ev.ends_at > now()
  `);
  return Number((result.rows[0] as { total: string | number } | undefined)?.total ?? 0);
}
