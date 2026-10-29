CREATE VIEW "public"."content_access" AS (
  select e.org_id, e.org_user_id, e.content_id, e.id as entitlement_id, e.granted_at, e.expires_at
  from entitlements e
  where e.content_id is not null
    and e.status = 'active'
    and (e.expires_at is null or e.expires_at >= now())
  union all
  select e.org_id, e.org_user_id, bi.content_id, e.id as entitlement_id, e.granted_at, e.expires_at
  from entitlements e
  join bundle_items bi on bi.org_id = e.org_id and bi.bundle_id = e.bundle_id
  where e.status = 'active'
    and (e.expires_at is null or e.expires_at >= now())
);