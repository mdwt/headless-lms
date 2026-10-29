import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { STAFF_ROLES } from "@headless-lms/core/organizations";
import { entitlements } from "../schema/entitlements.js";

export type GrantedContentType = "course" | "download" | "community";

export interface GrantColumns {
  orgId: SQLWrapper;
  contentId: SQLWrapper;
  bundleId: SQLWrapper;
}

export function grantUnexpired(
  expiresAt: SQLWrapper = entitlements.expiresAt,
  at: SQL = sql`now()`,
): SQL {
  return sql`(${expiresAt} is null or ${expiresAt} > ${at})`;
}

export function grantExpired(
  expiresAt: SQLWrapper = entitlements.expiresAt,
  at: SQL = sql`now()`,
): SQL {
  return sql`(${expiresAt} is not null and ${expiresAt} <= ${at})`;
}

export function grantIsActive(row: typeof entitlements = entitlements, at?: SQL): SQL {
  return sql`(${row.status} = 'active' and ${grantUnexpired(row.expiresAt, at)})`;
}

export function grantOpens(row: GrantColumns, contentId: SQL, type: GrantedContentType): SQL {
  return sql`(
    exists (
      select 1 from content_items ci
      where ci.org_id = ${row.orgId} and ci.id = ${contentId} and ci.type = ${type}
    )
    and (
      ${row.contentId} = ${contentId}
      or exists (
        select 1 from bundle_items bi
        where bi.org_id = ${row.orgId}
          and bi.bundle_id = ${row.bundleId}
          and bi.content_id = ${contentId}
      )
    )
  )`;
}

export function activeGrantCovers(
  orgId: SQL,
  orgUserId: SQL,
  contentId: SQL,
  type: GrantedContentType,
): SQL {
  return sql`exists (
    select 1 from content_access ca
    join content_items ci on ci.org_id = ca.org_id and ci.id = ca.content_id and ci.type = ${type}
    where ca.org_id = ${orgId}
      and ca.org_user_id = ${orgUserId}
      and ca.content_id = ${contentId}
  )`;
}

export function communityPublished(orgId: SQL, communityId: SQL): SQL {
  return sql`exists (
    select 1 from communities pc
    where pc.org_id = ${orgId} and pc.id = ${communityId} and pc.status = 'published'
  )`;
}

export function holdsCommunity(orgId: SQL, orgUserId: SQL, communityId: SQL): SQL {
  return sql`(${communityPublished(orgId, communityId)} and ${activeGrantCovers(orgId, orgUserId, communityId, "community")})`;
}

export function communityMember(orgId: SQL, orgUserId: SQL, role: SQL, communityId: SQL): SQL {
  const staff = sql.join(
    STAFF_ROLES.map((r) => sql`${r}`),
    sql`, `,
  );
  return sql`(${role} in (${staff}) or ${holdsCommunity(orgId, orgUserId, communityId)})`;
}
