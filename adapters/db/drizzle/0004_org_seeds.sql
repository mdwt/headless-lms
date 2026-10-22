INSERT INTO "automations" (
  "org_id",
  "id",
  "name",
  "kind",
  "description",
  "triggers",
  "actions",
  "enabled",
  "filter",
  "source"
)
SELECT
  o."id",
  'atm_' || replace(gen_random_uuid()::text, '-', ''),
  s.name,
  'workflow',
  s.description,
  s.triggers,
  s.actions,
  true,
  NULL,
  'system'
FROM "organizations" o
CROSS JOIN (
  VALUES
    (
      'Access granted',
      'Email the person when they are granted a content item.',
      ARRAY['entitlement.created']::text[],
      '[{"type":"sendEmail","input":{"template":"accessGranted"}}]'::jsonb
    ),
    (
      'Access revoked',
      'Email the person when a content grant is deleted.',
      ARRAY['entitlement.deleted']::text[],
      '[{"type":"sendEmail","input":{"template":"accessRevoked"}}]'::jsonb
    ),
    (
      'You are now a moderator',
      'Email the person when they are given the moderator role.',
      ARRAY['organization.user.updated']::text[],
      '[{"type":"sendEmail","input":{"template":"youAreNowAModerator"}}]'::jsonb
    ),
    (
      'Publish due posts',
      'Submit scheduled posts whose time has passed.',
      ARRAY['schedule:* * * * *']::text[],
      '[{"type":"publishDuePosts","input":{}}]'::jsonb
    ),
    (
      'Expire due grants',
      'Expire grants whose time has passed and remind those ending within a week.',
      ARRAY['schedule:0 * * * *']::text[],
      '[{"type":"expireDueGrants","input":{}}]'::jsonb
    ),
    (
      'Digest',
      'Open the daily digest for every community.',
      ARRAY['schedule:0 7 * * *']::text[],
      '[{"type":"sendDigest","input":{}}]'::jsonb
    )
) AS s(name, description, triggers, actions)
WHERE NOT EXISTS (
  SELECT 1
  FROM "automations" a
  WHERE a."org_id" = o."id"
    AND a."source" = 'system'
    AND a."name" = s.name
    AND a."filter" IS NULL
);
