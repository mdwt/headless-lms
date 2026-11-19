# Apps and domains

The source of truth for how an organization's frontends and their domains work, and what
[#41](https://github.com/mdwt/headless-lms/issues/41) needs.

## What an app is

An app is a frontend an organization runs on a domain. It serves courses, the community, or both.

A domain is the whole origin the app is reached at, with its scheme and port.

For example, on a platform at `https://example.com` Acme starts with one app at `https://acme.example.com` serving
both. It later runs a course app at `https://learn.acme.com` and a community app at `https://club.acme.com`.

One frontend deployment serves many organizations: each organization's domain points at it, and the domain says
whose courses or community to show.

## Rules

- A domain belongs to one app, and so to one organization, across the whole system.
- An organization has at most one app that serves courses and at most one that serves the community.
- A new organization gets one app that serves both. The app takes the organization's name and slug. Its domain is
  the organization's slug as a subdomain of the platform host (`PLATFORM_HOST`), as its two hosts are assigned
  today.
- A session started on an app's domain is for that app's organization.
- An app's domain reaches the API under `/api`. The browser's calls, the session cookie and the links in the
  sign-in emails all use the app's domain.
- The API reads a request's domain to know its app and organization. No route tells a caller which app or
  organization a domain is.

## The table

Owned by organizations.

```
apps
  org_id      text not null → organizations, cascade on delete
  id          text not null
  name        text not null
  slug        text not null
  domain      text not null
  courses     boolean not null
  community   boolean not null
  primary key (org_id, id)
  unique (org_id, slug)
  unique (domain)
  unique (org_id) where courses
  unique (org_id) where community
  check (courses or community)
```

A domain is stored as an origin, normalised the way `hostSchema` normalises a host today. Saving a domain another
app has, or a second app that serves courses or the community, is a 409.

The first app is created in the same unit of work as its organization. When another app already has the domain,
creating the organization is a 409 and nothing is created.

## Managing apps

Organizations creates, lists, updates and deletes apps. Listing needs `organizations:read`. Creating, updating and
deleting need `organizations:write`.

The routes are under `/api/organizations/apps`, with an MCP tool for each.

"App" means only this. A program a person has authorised is a connected app: its routes move from
`/api/access/apps` to `/api/access/connected-apps`, and the sign-in port's `listApps` becomes `listConnectedApps`.

## Requests from an app's domain

A request carries its domain in its `Origin` header, or else its `Referer`.

- It is logged with the app's id.
- With a session for another organization it is a 401. This happens when `AUTH_COOKIE_DOMAIN` shares one cookie
  across the organizations' subdomains: Sarah signs in on Acme's domain and then opens Globex's.

## The student app

One deployment serves any organization's domain, with no setting per organization. The session says whose courses
to show.

- Its browser code calls the API at its own origin under `/api`, and the student app forwards `/api` to the API
  (`API_URL`). `NEXT_PUBLIC_API_URL` goes.
- Its server calls carry the visitor's domain as `Origin`.
- It has a page to ask for a password reset, a page to set the new password, and a page to ask for a sign-in link.
  Each names its own domain as the link's return address.

A platform that runs its own frontends knows which organization a domain is, because it set the domain.

## Which organization a session is for

When a session is created, the API reads the domain of the sign-in: the `Origin` or `Referer` header, or the origin
of the link's return address (`requestOrigins` in `adapters/auth/src/better-auth.ts`).

| The domain is                                                     | The session                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| An app's, and the person is active in its organization            | Is for that organization                               |
| An app's, and the person holds an open invite to its organization | Has no organization; accepting the invite sets it      |
| An app's, and the person is neither                               | Is refused                                             |
| Any other domain, or none                                         | As today: the person's organization when they have one |

For example, Sarah is in Acme and Globex, and James is only in Globex:

- Sarah signs in on `https://learn.acme.com` and gets an Acme session. On Globex's domain she gets a Globex one.
- James signs in on `https://learn.acme.com` and is refused.
- Emma was invited to Acme. She signs in on `https://learn.acme.com`, accepts the invite, and her session is for
  Acme.

## Which domain a link uses

| The link is about                                | Domain                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| A course, an activity, a download or a bundle    | The organization's app that serves courses          |
| A community, a space, a post, a chat or an event | The organization's app that serves the community    |
| A password reset or a sign-in link               | The app domain it returns to, under `/api`          |
| An invite for a role with no permissions         | The domain named on the invite, or the course app's |
| An invite for a role with permissions            | The admin app, as today                             |

For Acme with two apps:

- An email about a completed course links to `https://learn.acme.com`.
- An email about a new post links to `https://club.acme.com`.
- Sarah asks for a sign-in link on `https://club.acme.com`. The link opens at
  `https://club.acme.com/api/auth/...`, so the session cookie belongs to `club.acme.com`, and she lands there
  signed in.

An emailed invite for a role with no permissions, with no domain named and no app that serves courses, is a 409.

The calendar file of an event leaves the event page link out when the organization has no app that serves the
community.

## What an email template receives

In place of the `hosts` pair, a template receives:

- **The organization**: its id, name, slug and metadata. Metadata is what the platform set when it created the
  organization, so a platform reads its own customer id from it.
- **The course app and the community app**: each with its id, name, slug and domain.
- **The app the email was requested on**, for the three sign-in emails.
- **The recipient**: the email address, and the id, first name and last name when a person has that address.

An email sent outside an organization receives no organization and no apps.

## The three sign-in emails (#41)

Today the password reset, password changed and sign-in link emails reach the templates without an organization. The
container's hooks (`packages/server/src/app/container.ts`) pass the email and the link to identity and drop the
domain.

The domain names the organization:

1. The sign-in adapter passes the domain to its hooks.
2. Organizations looks the domain up.
3. Identity's `sendPasswordReset`, `sendPasswordChanged` and `sendMagicLink`
   (`packages/core/src/identity/service.ts`) send with that organization and app, so the templates receive them
   as they do for an invite.

| Email            | The domain is                                                                       |
| ---------------- | ----------------------------------------------------------------------------------- |
| Password reset   | The origin of the link's return address                                             |
| Sign-in link     | The origin of the link's return address                                             |
| Password changed | The `Origin` header of the request that set the new password, or else its `Referer` |

A password reset or a sign-in link that returns to an app's domain is sent only to a person active in that app's
organization, as today. A password changed email is sent with the organization only when the person is active in
it.

A frontend that sets the new password from its server forwards the `Origin` header. Without it the password changed
email is sent without an organization.

## What exists today

- An organization has two hosts, `hosts.courses` and `hosts.community` (`hostsSchema` in
  `packages/core/src/types/schemas/organizations.ts`), kept as JSON in the shared `settings` table and managed by
  `OrgHostSettings` (`packages/core/src/organizations/hosts.ts`).
- Two organizations can hold the same host: the lookup indexes are not unique
  (`adapters/db/src/schema/settings.ts`) and `findOrgIdsByHost` returns a list.
- A new organization's hosts are assigned after the unit of work that creates it (`provisionOrganization` in
  `packages/core/src/organizations/service.ts`).
- The organization, platform and MCP organization responses carry `hosts`, and updating an organization accepts
  them.
- A template receives the brand name, the admin app's address and the two hosts (`TemplateContext` in
  `packages/core/src/types/email-templates.ts`). Templates build links through the helpers in
  `adapters/email-templates/src/emails/community.tsx`, used by the community, event, access granted and course
  activity emails. The calendar file's event page link uses the community host
  (`packages/core/src/reporting/member/service.ts`).
- Sign-in works from either host (`isOrgHost`, `isHostOfPerson`).
- A session gets an organization only when the person is in exactly one, whatever domain they signed in on
  (`beforeCreateSession` in `packages/server/src/app/container.ts`). A person in two gets a session with none, and
  the student app signs them out.
- An invite takes a `host`, which must be one of the organization's two and defaults to the course host
  (`inviteHost` in `packages/core/src/organizations/service.ts`).
- A password reset link and a sign-in link open at the API's one address (`baseURL` in
  `adapters/auth/src/better-auth.ts`) and then return to the organization's host. The session cookie of a sign-in
  link is set at the API's address, so with a host-only cookie the person lands on the organization's host signed
  out.
- The student app's browser code calls the API at one fixed address (`NEXT_PUBLIC_API_URL`), and the API answers a
  browser only from the origins in `CLIENT_ORIGIN` (`packages/server/src/http/plugins/cors.ts`), so it cannot run
  on an organization's domain. Its server calls carry no `Origin` (`apps/student/src/lib/api/server-call.ts`). It
  has no page to ask for a password reset or a sign-in link.
- "App" also names a connected app (`/api/access/apps`).

## What changes

- The `apps` table replaces the two host settings and their indexes. `OrgHostSettings`, `OrgHostIndex` and
  `DrizzleOrgHostIndex` go.
- Organizations creates, lists, updates and deletes apps and looks a domain up. Creating an organization creates
  its first app in the same unit of work.
- The API gets the app routes and their MCP tools. `hosts` leaves the organization, platform and MCP organization
  payloads.
- A request from an app's domain is logged with the app's id, and is a 401 with a session for another
  organization.
- A password reset link and a sign-in link that return to an app's domain are written at that domain under `/api`.
- The connected app routes and the sign-in port's method are renamed.
- The student app calls the API at its own origin, sends the visitor's domain on its server calls, and gets its
  password reset and sign-in link pages.
- `isOrgHost` and `isHostOfPerson` read `apps`.
- `beforeCreateSession` sets the session's organization from the domain of the sign-in.
- An invite's `host` becomes `domain`, checked against the organization's apps.
- `TemplateContext.hosts` becomes the organization, the apps and the recipient. The templates build their links
  from the apps, and the calendar file's event page link becomes optional.
- The three sign-in emails are sent with the organization and app of their domain.
- `docs/domain/organizations.md` describes apps where it describes hosts.
- The website docs describe apps where they describe hosts: `self-hosting.mdx`, `api-keys.mdx` and
  `adapters/email/react-email.mdx` in `apps/website/content/docs`.
