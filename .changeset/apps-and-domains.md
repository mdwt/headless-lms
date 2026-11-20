---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-auth": minor
"@headless-lms/adapter-db": minor
"@headless-lms/adapter-email-templates": minor
"create-headless-lms": patch
---

An organization's two hosts become apps. An app is a frontend the organization runs on a domain, with a name and a slug, serving courses, the community, or both. A domain belongs to one app across the installation, and an organization has at most one app that serves courses and one that serves the community. A new organization starts with no app; it creates one in the admin's Settings → Apps or with `POST /api/apps`.

- `GET`, `POST /api/apps` and `PATCH`, `DELETE /api/apps/:appId` manage them, with the MCP tools `list_apps`, `create_app`, `update_app` and `delete_app`. Listing needs `organizations:read`, the rest `organizations:write`. The SDK has them as `Apps`.
- Apps belong to no context: `AppsService` in `@headless-lms/core/shared/apps` holds them and the lookup from a domain to its app and organization, and the container has it as `apps`.
- `GET /api/app` tells a frontend which organization and app the domain of the request is, with no session and no key. It answers for the `Origin` header, or else the `Referer`, and is limited to 100 requests in 10 seconds per client IP address.
- A session started on an app's domain is for that app's organization. A person with an open invite there gets a session with no organization, and anyone else is refused: a sign-in answers `401`. On an origin in `CLIENT_ORIGIN`, or with no origin, a person in exactly one organization gets a session for it, as before.
- A request with a session from an app's domain is logged with the app's id, and is a `401` when the session is for another organization.
- With `AUTH_COOKIE_DOMAIN` set, a sign-in from a domain outside it gets a host-only cookie, so an organization's own domain works beside the shared one.
- The admin app's address, the API's and every origin in `CLIENT_ORIGIN` are refused as an app's domain, under either scheme. A domain is a bare `http` or `https` origin: a path, a query, a username or password, or a trailing dot is refused.
- `POST /api/organizations` and `POST /api/platform/organizations` generate the slug from the name when none is sent.
- A password reset link and a sign-in link that return to an app's domain open at that domain under `/api`, so a sign-in link's cookie belongs to the domain the person lands on.
- The password reset, password changed and sign-in link emails are sent with the organization and the app they were asked for on.
- Email templates receive the organization (`id`, `name`, `slug`, `metadata`), its `courseApp` and `communityApp`, the `requestedApp` of a sign-in email, and the `recipient` (`email`, and the `id`, `firstName` and `lastName` of the person who has that address).
- The event calendar file leaves the event page link out when no app serves the community.
- An emailed invite for a role with no permissions is a `409` when it names no domain and the organization has no app that serves courses.
- The admin's Settings → Apps lists, creates, changes and deletes apps. A refused save shows why on the field.

Breaking:

- `PLATFORM_HOST` (`Config.platformHost`) is removed, and creating an organization no longer creates its first host. Create the organization's app with `POST /api/apps`.
- `CLIENT_ORIGIN` no longer lists the student app's origin by default (`http://localhost:8001` only). Remove a frontend's origin from it before making that origin an app's domain.
- `hosts` leaves the organization, platform and MCP organization payloads, and `PATCH /api/organizations` no longer takes it. Manage apps under `/api/apps`.
- `createInvite` and `resendInvite` take `domain` in place of `host`, as do the MCP tools `invite_person` and `resend_invite`; `update_organization` loses `hosts`. A request that still sends `hosts` or `host` is answered as before, with the field ignored.
- `OrganizationService.createOrganization` and `updateOrganization` no longer return `hosts`, `createOrganization` takes `{ name, slug? }`, and `PlatformOrganizationDetails` loses `hosts`.
- The connected app routes move from `/api/access/apps` to `/api/access/connected-apps`; the `ApiKeys` port's `listApps` and `revokeApp` become `listConnectedApps` and `revokeConnectedApp`.
- `TemplateContext.hosts` is replaced by `organization`, `courseApp`, `communityApp`, `requestedApp` and `recipient`. `Mailer` takes `MailerSources` in place of a hosts function, and `Mailer.send` takes the app id as its fifth argument.
- `OrgHostSettings`, `OrgHostSettingsParams`, `OrgHostIndex` and `DrizzleOrgHostIndex` are removed, with the `Hosts` type and the `hostSchema` and `hostsSchema` schemas; `domainSchema` validates an app's domain. `OrganizationServiceParams` takes `apps`, an `AppsService`, in place of `hosts`, and `MemberReportServiceParams.hosts` is replaced by `communityDomain`.
- `OrganizationService` loses `isOrgHost`, `isHostOfPerson` and `getOrgUsersForUser`, and gains `appOfPerson` and `sessionOrganization`. `UpdateOrganizationInput` loses `hosts`.
- The sign-in adapter's `orgHosts` option (`OrgHosts`) is renamed `appDomains` (`AppDomains`).
- The sign-in adapter's `beforeCreateSession`, `sendResetPassword`, `onPasswordReset` and `sendMagicLink` hooks receive the domains the request names (`{ domains }`) as their second argument.
- Migration `0023_apps` creates the `apps` table and drops the two host indexes on `settings`. An organization created before it has no app until one is created.
