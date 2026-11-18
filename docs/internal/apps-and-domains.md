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
- A new organization gets one app that serves both. Its domain is the organization's slug as a subdomain of the
  platform host (`PLATFORM_HOST`), as its two hosts are assigned today.
- Looking a domain up gives its app and organization. A domain that is no app's domain is a 404.

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

## The domain of a request

The domain of a request to the API is the origin the sign-in adapter already reads: the `Origin` or `Referer` header
and the origin of the link's return address (`requestOrigins` and `callbackOrigins` in
`adapters/auth/src/better-auth.ts`). A request from an app's domain is logged with the app's id.

## Which domain a link uses

| The link is about                                | Domain                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| A course, an activity, a download or a bundle    | The organization's app that serves courses          |
| A community, a space, a post, a chat or an event | The organization's app that serves the community    |
| A password reset or a sign-in link               | The app domain it returns to                        |
| An invite for a role with no permissions         | The domain named on the invite, or the course app's |
| An invite for a role with permissions            | The admin app, as today                             |

For Acme with two apps:

- An email about a completed course links to `https://learn.acme.com`.
- An email about a new post links to `https://club.acme.com`.
- Sarah asks for a password reset on `https://club.acme.com`. The link returns there.

## What an email template receives

A template receives the organization's course app and community app, each with its id, name, slug and domain, in
place of the `hosts` pair. An email sent outside an organization receives neither.

## The three sign-in emails (#41)

Today the password reset, password changed and sign-in link emails reach the templates without an organization. The
container's hooks (`packages/server/src/app/container.ts`) pass the email and the link to identity and drop the
domain.

The domain names the organization:

1. The sign-in adapter passes the domain to its hooks.
2. Organizations looks the domain up.
3. Identity's `sendPasswordReset`, `sendPasswordChanged` and `sendMagicLink`
   (`packages/core/src/identity/service.ts`) send with that organization, so the templates receive its apps as they
   do for an invite.

A reset or sign-in link that returns to an app's domain is sent only to a person active in that organization, as
today.

## What exists today

- An organization has two hosts, `hosts.courses` and `hosts.community` (`hostsSchema` in
  `packages/core/src/types/schemas/organizations.ts`), kept as JSON in the shared `settings` table and managed by
  `OrgHostSettings` (`packages/core/src/organizations/hosts.ts`).
- Two organizations can hold the same host: the lookup indexes are not unique
  (`adapters/db/src/schema/settings.ts`) and `findOrgIdsByHost` returns a list.
- The organization, platform and MCP organization responses carry `hosts`, and updating an organization accepts
  them.
- Email templates build links from them through the helpers in `adapters/email-templates/src/emails/community.tsx`,
  used by the community, event, access granted and course activity emails. The calendar file's event page link uses
  the community host (`packages/core/src/reporting/member/service.ts`).
- Sign-in works from either host (`isOrgHost`, `isHostOfPerson`).
- An invite takes a `host`, which must be one of the organization's two and defaults to the course host
  (`inviteHost` in `packages/core/src/organizations/service.ts`).

## What changes

- The `apps` table replaces the two host settings and their indexes. `OrgHostSettings`, `OrgHostIndex` and
  `DrizzleOrgHostIndex` go.
- Organizations creates, lists, updates and deletes apps, each needing `organizations:write`, and looks a domain up.
  Creating an organization creates its first app.
- The API gets app routes and MCP tools. `hosts` leaves the organization, platform and MCP
  organization payloads. The admin app gets a screen for apps.
- `isOrgHost` and `isHostOfPerson` read `apps`.
- An invite's `host` becomes `domain`, checked against the organization's apps.
- `TemplateContext.hosts` becomes the two apps, and the templates and the calendar file link build from them.
- The three sign-in emails are sent with the organization of their domain.
- `docs/domain/organizations.md` describes apps where it describes hosts.

## Not settled

- **The name.** "App" already means a connected app, an outside program a person has authorised
  (`/api/access/apps`). The two need different names in the API and the docs.
