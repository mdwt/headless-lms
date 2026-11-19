---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-auth": minor
"@headless-lms/adapter-db": minor
"@headless-lms/adapter-email-templates": minor
---

An organization's two hosts become apps. An app is a frontend the organization runs on a domain, with a name and a slug, serving courses, the community, or both. A domain belongs to one app across the installation, and an organization has at most one app that serves courses and one that serves the community. A new organization starts with one app that serves both, at `PLATFORM_HOST`. When another app already has that address, or the installation has a platform key, it starts at its slug as a subdomain of `PLATFORM_HOST`; creating it is a `409` when another app already has that domain.

- `GET`, `POST /api/organizations/apps` and `PATCH`, `DELETE /api/organizations/apps/:appId` manage them, with the MCP tools `list_apps`, `create_app`, `update_app` and `delete_app`. Listing needs `organizations:read`, the rest `organizations:write`.
- `GET /api/app` tells a frontend which organization and app the domain of the request is, with no session and no key. It answers for the `Origin` header, or else the `Referer`, and is limited to 100 requests in 10 seconds per client IP address.
- A session started on an app's domain is for that app's organization. A person with an open invite there gets a session with no organization, and anyone else is refused: a sign-in answers `401`. On any other origin a person in exactly one organization gets a session for it, as before.
- A request from an app's domain is logged with the app's id, and is a `401` with a session for another organization.
- With `AUTH_COOKIE_DOMAIN` set, a sign-in from a domain outside it gets a host-only cookie, so an organization's own domain works beside the shared one.
- The admin app's address and the API's are refused as an app's domain, and so is creating an organization whose first domain would be one of them.
- A password reset link and a sign-in link that return to an app's domain open at that domain under `/api`, so a sign-in link's cookie belongs to the domain the person lands on.
- The password reset, password changed and sign-in link emails are sent with the organization and the app they were asked for on.
- Email templates receive the organization (`id`, `name`, `slug`, `metadata`), its `courseApp` and `communityApp`, the `requestedApp` of a sign-in email, and the `recipient` (`email`, and the `id`, `firstName` and `lastName` of the person who has that address).
- The event calendar file leaves the event page link out when no app serves the community.
- An emailed invite for a role with no permissions is a `409` when it names no domain and the organization has no app that serves courses.

Breaking:

- `hosts` leaves the organization, platform and MCP organization payloads, and `PATCH /api/organizations` no longer takes it. Manage apps under `/api/organizations/apps`.
- `createInvite` and `resendInvite` take `domain` in place of `host`.
- The connected app routes move from `/api/access/apps` to `/api/access/connected-apps`; the `ApiKeys` port's `listApps` and `revokeApp` become `listConnectedApps` and `revokeConnectedApp`.
- `TemplateContext.hosts` is replaced by `organization`, `courseApp`, `communityApp`, `requestedApp` and `recipient`. `Mailer` takes `MailerSources` in place of a hosts function, and `Mailer.send` takes the app id as its fifth argument.
- `OrgHostSettings`, `OrgHostIndex` and `DrizzleOrgHostIndex` are removed. `OrganizationServiceParams` takes `apps` and `platformHost` in place of `hosts`, `OrganizationsWriteScope` gains `apps`, and `MemberReportServiceParams.hosts` is replaced by `communityDomain`.
- The sign-in adapter's `beforeCreateSession`, `sendResetPassword`, `onPasswordReset` and `sendMagicLink` hooks receive the domains the request names (`{ domains }`) as their second argument.
- Migration `0023_apps` creates the `apps` table and drops the two host indexes on `settings`. An organization created before it has no app until one is added.
