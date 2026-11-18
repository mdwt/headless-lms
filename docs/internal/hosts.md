# Hosts

The source of truth for how an organization's hosts work. Design in progress; not built. It replaces the two host
settings an organization has today, and it is what [#41](https://github.com/mdwt/headless-lms/issues/41) needs.

## What a host is

A host is the full origin an organization's app is reached at, such as `https://acme.example.com` or
`https://learn.acme.com`. It is the whole origin, with its scheme and port, not the platform's host.

## Rules

- A host belongs to one organization, across the whole system. No two organizations share a host.
- An organization has any number of hosts.
- A new organization starts with one host, its slug under the platform's host: `https://<slug>.<PLATFORM_HOST>`.
- An organization has a default host. It starts as the host the organization was created with, and an admin can
  change it.
- A course, a community or an event can pin one of its organization's hosts. An item with no pin uses the default
  host.
- A request that arrives on a host is for the organization that host belongs to.

## The table

Owned by organizations.

```
hosts
  org_id   text not null → organizations, cascade on delete
  host     text not null                 full origin
  primary key (org_id, host)
  unique (host)                          one organization per host, system-wide
```

The table says which hosts an organization has and nothing else. It has no column per kind of app and no column
that names an item.

## Pinning an item to a host

The pin is made on the item, not in the `hosts` table.

- The pin is stored with the item's own settings.
- There is no foreign key from content to `hosts`. An item is created without a host.
- When a pin is saved, content checks with organizations that the host is one of the organization's hosts.
- Removing a host checks nothing in content. An item pinned to a host that no longer exists uses the default host.
- What sits inside an item uses the item's host: a module and an activity use their course's, a space, a post, a
  comment and a chat use their community's.

## Which host a link uses

| The link is                                                        | Host                                        |
| ------------------------------------------------------------------ | ------------------------------------------- |
| About an item: a new post, a course completed, an event reminder   | The item's pin, or the default host         |
| About the organization and no item: an invite                      | The default host                            |
| Asked for on a host: password reset, password changed, sign-in link | The host it was asked for on                |

For example, Acme has `https://acme.example.com`, `https://learn.acme.com` and `https://club.acme.com`, with
`https://learn.acme.com` as its default. Its community pins `https://club.acme.com`; its courses pin nothing.

- An email about a new post links to `https://club.acme.com`.
- An email about a completed course links to `https://learn.acme.com`.
- Sarah asks for a password reset on `https://club.acme.com`. The email is Acme's and its link returns to
  `https://club.acme.com`.

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

- An organization has two hosts, one for its course app and one for its community app, kept as
  `hosts.courses` and `hosts.community` in the shared `settings` table (`packages/core/src/organizations/hosts.ts`).
- A new organization gets `https://<slug>.<PLATFORM_HOST>` for both.
- Nothing stops two organizations from holding the same host. The lookup indexes are not unique
  (`adapters/db/src/schema/settings.ts`) and `findOrgIdsByHost` returns a list of organizations.
- An email template picks between the two: links about a community, a post or an event use `hosts.community`, links
  about a course use `hosts.courses` (`adapters/email-templates`).
- Sign-in works from any of an organization's hosts, and a sign-in or reset link that returns to an organization's
  host is sent only to a person active in that organization (`adapters/auth/src/better-auth.ts`).

The two settings, their indexes and the `Hosts` pair handed to templates go away. A template is handed the one host
its email links to.

## Not settled

- **How the default host is recorded.** Not as a boolean column on `hosts`.
- **Downloads.** A course, a community and an event each have a settings record that can hold a pin. A download has
  none. Either a download gets one, or a download always uses the default host.
