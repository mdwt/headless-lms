# Apps and domains

The source of truth for how an organization's frontends and their domains work. Agreed; not built. It replaces the
two host settings an organization has today, and it is what
[#41](https://github.com/mdwt/headless-lms/issues/41) needs.

## What an app is

An app is a frontend an organization runs on a domain. The system offers two things a frontend can serve: courses
and a community. An app serves one of them or both.

- **One app for both.** One domain, serving courses and the community.
- **A course app and a community app.** Two domains, one each.

For example, on a platform at `example.com` Acme starts with one app at `https://acme.example.com` serving both. It
later runs a course app at `https://learn.acme.com` and a community app at `https://club.acme.com`.

A domain is the whole origin the app is reached at, with its scheme and port.

One frontend deployment can serve many organizations. Each organization's domain points at it, and the domain of a
request says whose courses or community to show.

## Rules

- A domain belongs to one app, and so to one organization, across the whole system.
- An organization has at most one app that serves courses and at most one that serves the community.
- A new organization gets one app at `https://<slug>.<PLATFORM_HOST>` that serves both.
- A request that arrives on a domain is for that domain's app and its organization. Everything logged for the
  request carries the app's id.
- A request on a domain that is no app's domain gets a 404.

## The table

Owned by organizations.

```
apps
  org_id      text not null → organizations, cascade on delete
  id          text not null
  name        text not null
  slug        text not null
  domain      text not null             full origin
  courses     boolean not null          serves courses
  community   boolean not null          serves the community
  primary key (org_id, id)
  unique (org_id, slug)
  unique (domain)                       one app per domain, system-wide
  unique (org_id) where courses         one course app per organization
  unique (org_id) where community       one community app per organization
  check (courses or community)
```

## Which domain a link uses

| The link is                                                           | Domain                                           |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| About a course or an activity                                         | The organization's app that serves courses       |
| About a community, a space, a post, a chat or an event                | The organization's app that serves the community |
| Asked for on a domain: password reset, password changed, sign-in link | The domain it was asked for on                   |
| An invite                                                             | The domain it was sent from                      |

For Acme with two apps:

- An email about a completed course links to `https://learn.acme.com`.
- An email about a new post links to `https://club.acme.com`.
- Sarah asks for a password reset on `https://club.acme.com`. The email is Acme's and its link returns to
  `https://club.acme.com`.

## Emails asked for on a domain (#41)

The password reset, password changed and sign-in link emails are sent with no organization today, so they carry no
organization's domains or branding. The sign-in adapter knows the domain the request came from, and the hooks in
the container (`packages/server/src/app/container.ts`) pass on only the email and the link.

With one organization per domain, the domain names the organization:

1. The sign-in adapter passes the domain of the request to its hooks.
2. Organizations resolves the domain to its app and organization.
3. Identity's `sendPasswordReset`, `sendPasswordChanged` and `sendMagicLink`
   (`packages/core/src/identity/service.ts`) send for that organization.

## What exists today

- An organization has two hosts, `hosts.courses` and `hosts.community` (`hostsSchema` in
  `packages/core/src/types/schemas/organizations.ts`), kept as JSON in the shared `settings` table and managed by
  `OrgHostSettings` (`packages/core/src/organizations/hosts.ts`).
- A new organization gets `https://<slug>.<PLATFORM_HOST>` for both.
- Email templates build links from them: `adapters/email-templates/src/emails/community.tsx`. The calendar file's
  event page link uses the community host (`packages/core/src/reporting/member/service.ts`).
- Sign-in works from either of an organization's hosts, and a sign-in or reset link that returns to an
  organization's host is sent only to a person active in that organization (`adapters/auth/src/better-auth.ts`).
- Nothing stops two organizations from holding the same host. The lookup indexes are not unique
  (`adapters/db/src/schema/settings.ts`) and `findOrgIdsByHost` returns a list of organizations.

## What changes

- The `apps` table replaces the two host settings, their indexes and `OrgHostSettings`.
- Organizations creates, lists, updates and deletes apps. Each needs the permission that replacing the hosts needs
  today, `organizations:write`.
- The API gets app routes and MCP tools, and the SDK is regenerated. The admin app gets a screen for them.
- The sign-in checks for "is this one of the organization's domains" read `apps`.
- The three emails asked for on a domain are sent for that domain's organization.
- Links in emails and in the calendar file use the domain of the app that serves courses or the community.

## Not settled

- **The name.** "App" already means a connected app, an outside program a person has authorised
  (`/api/access/apps`). The two need different names in the API and the docs.
