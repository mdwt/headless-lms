# Hosts

The source of truth for how an organization's hosts work. Design in progress; the changes below are not built. It is
what [#41](https://github.com/mdwt/headless-lms/issues/41) needs.

## What a host is

A host is the address a frontend runs at for one organization, such as `https://acme.example.com` or
`https://learn.acme.com`. It is the whole origin, with its scheme and port, not the platform's host.

## The two hosts

The system offers a course backend and a community backend, so an organization has two hosts: one for courses and
one for its community.

- **One frontend for both.** Both hosts are the same address.
- **A course platform and a community platform.** Each has its own address.

Both are always set. A new organization starts with `https://<slug>.<PLATFORM_HOST>` for both and changes them
later.

For example, on a platform at `example.com` Acme starts with `https://acme.example.com` for both. It later sets
`https://learn.acme.com` for courses and `https://club.acme.com` for its community.

There is no record of a frontend and no list of frontends an operator defines. The two kinds are the two backends
the system has.

## Rules

- A host belongs to one organization, across the whole system. No two organizations share a host.
- One organization can use the same host for courses and for its community.
- A request that arrives on a host is for the organization that host belongs to.

One frontend deployment can serve many organizations: each organization's host points at it, and the host of a
request says whose courses or community to show.

## Which host a link uses

| The link is                                                         | Host                         |
| ------------------------------------------------------------------- | ---------------------------- |
| About a course or an activity                                       | The courses host             |
| About a community, a space, a post, a chat or an event              | The community host           |
| Asked for on a host: password reset, password changed, sign-in link | The host it was asked for on |
| An invite                                                           | The host it was sent from    |

## Emails asked for on a host (#41)

The password reset, password changed and sign-in link emails are sent with no organization today, so they carry no
organization's hosts or branding. The sign-in adapter knows the host the request came from, and the hooks in the
container (`packages/server/src/app/container.ts`) pass on only the email and the link.

With one organization per host, the host names the organization:

1. The sign-in adapter passes the host of the request to its hooks.
2. Organizations resolves the host to its organization.
3. Identity's `sendPasswordReset`, `sendPasswordChanged` and `sendMagicLink`
   (`packages/core/src/identity/service.ts`) send for that organization.

## What exists today

- The two hosts are `hosts.courses` and `hosts.community` (`hostsSchema` in
  `packages/core/src/types/schemas/organizations.ts`), kept as JSON in the shared `settings` table and managed by
  `OrgHostSettings` (`packages/core/src/organizations/hosts.ts`).
- Email templates build links from them: `adapters/email-templates/src/emails/community.tsx`. The calendar file's
  event page link uses the community host (`packages/core/src/reporting/member/service.ts`).
- Sign-in works from either of an organization's hosts, and a sign-in or reset link that returns to an
  organization's host is sent only to a person active in that organization (`adapters/auth/src/better-auth.ts`).
- Nothing stops two organizations from holding the same host. The lookup indexes are not unique
  (`adapters/db/src/schema/settings.ts`) and `findOrgIdsByHost` returns a list of organizations.

## What changes

- One organization per host is enforced, and looking up a host returns one organization.
- The three emails asked for on a host are sent for that host's organization.

## Not settled

- **How one organization per host is stored and enforced.** A unique index on each of the two JSON fields is not
  enough: it stops two organizations sharing a courses host, but not one organization's courses host being another's
  community host, and one organization must still be able to use the same host for both.
