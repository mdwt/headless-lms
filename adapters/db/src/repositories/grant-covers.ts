import { sql, type SQL } from "drizzle-orm";
import { entitlements } from "../schema/entitlements.js";

export type GrantedContentType = "course" | "download" | "community";

export function grantIsActive(row: typeof entitlements = entitlements): SQL {
  return sql`(${row.status} = 'active' and (${row.expiresAt} is null or ${row.expiresAt} > now()))`;
}

export function grantOpens(
  row: typeof entitlements,
  contentId: SQL,
  type: GrantedContentType,
): SQL {
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
    select 1 from ${entitlements}
    where ${entitlements.orgId} = ${orgId}
      and ${entitlements.orgUserId} = ${orgUserId}
      and ${grantIsActive(entitlements)}
      and ${grantOpens(entitlements, contentId, type)}
  )`;
}
