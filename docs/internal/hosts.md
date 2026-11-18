# Hosts

The source of truth for how an organization's hosts work. Design in progress; not built. It replaces the two host
settings an organization has today, and it is what [#41](https://github.com/mdwt/headless-lms/issues/41) needs.

## What a host is

A host is the address an app runs at, such as `https://acme.example.com` or `https://learn.acme.com`. It is the
whole origin, with its scheme and port, not the platform's host.

## What links to a host

An app links to a host. An app is the frontend a member uses, and it is the only thing that runs on a host. A course
and a community do not run on a host; they are shown inside an app.

- **A course app** shows all of an organization's courses. An organization with 1,000 courses has one course app at
  one host, and every one of those courses is reached there.
- **A community app** shows a community. It is mostly one community per app.

An organization can run several apps, each at its own host. For example, Acme runs its course app at
`https://learn.acme.com` and its community app at `https://club.acme.com`.

The system keeps no record of an app or of what kind it is. It keeps the organization's hosts, and for a course or a
community the host of the app it is shown in, so that a link to it goes to the right app.

## Rules

- A host belongs to one organization, across the whole system. No two organizations share a host.
- An organization has any number of hosts.
- A new organization starts with one host, its slug under the platform's host: `https://<slug>.<PLATFORM_HOST>`.
- An organization has a default host. It starts as the host the organization was created with, and an admin can
  change it.
- A course, a community or an event is shown in the app at the default host, unless it names another of the
  organization's hosts. With one course app at the default host, no course names anything.
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
that names a course or a community.

## Which app a course or a community is shown in

A course or a community that is not shown in the app at the default host names the host of the app it is shown in.
That is recorded on the course or the community, not in the `hosts` table. An event works the same way.

- The host is stored with the course's or the community's own settings.
- There is no foreign key from content to `hosts`. A course or a community is created without naming a host.
- When a host is saved on a course or a community, content checks with organizations that it is one of the
  organization's hosts.
- Removing a host checks nothing in content. A course or a community whose host no longer exists is shown at the
  default host.
- What sits inside goes with it: a module and an activity with their course, a space, a post, a comment and a chat
  with their community.

## Which host a link uses

| The link is                                                                                | Host                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------- |
| About a course, a community or an event: a new post, a course completed, an event reminder | The host of the app it is shown in |
| About the organization only: an invite                                                     | The default host                   |
| Asked for on a host: password reset, password changed, sign-in link                        | The host it was asked for on       |

For example, Acme has `https://acme.example.com`, `https://learn.acme.com` and `https://club.acme.com`. Its course
app runs at `https://learn.acme.com`, which is its default host, so none of its courses names a host. Its community
app runs at `https://club.acme.com`, and its community names that host.

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
- **Downloads.** A course, a community and an event each have a settings record that can hold a host. A download
  has none. Either a download gets one, or a download is always reached on the default host.
