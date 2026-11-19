# Apps and domains

The source of truth for how an organization's frontends and their domains work, and what
[#41](https://github.com/mdwt/headless-lms/issues/41) needs.

## What an app is

An app is a frontend an organization runs on a domain. It serves courses, the community, or both.

A domain is the whole origin the app is reached at, with its scheme and port.

For example, on a platform at `https://example.com` Acme starts with one app at `https://acme.example.com` serving
both. It later runs a course app at `https://learn.acme.com` and a community app at `https://club.acme.com`. A
school that hosts the system for itself at `https://learn.school.com` has one app, at that address.

One frontend deployment serves many organizations: each organization's domain points at it, and the domain says
whose courses or community to show.

## Use cases

The design has to work for all four.

**1. One organization, the bundled apps.** A school hosts the system for itself and serves the student app at its
own domain.

- It needs its domain on every link the API writes.
- It has one organization, and its domain is that organization's app.

**2. Several organizations, the bundled apps.** An agency hosts the system for five clients. One student app
deployment serves all five, and each client's domain points at it.

- The student app needs to know which organization a domain is before anyone signs in, to show that organization's
  name and to answer a domain nobody registered with a 404.
- A person who signs in on a client's domain gets that client's courses.

**3. Someone's own frontend.** A developer builds a site on the API in place of the bundled apps.

- It needs the same as use case 2.
- Its server calls the API on the visitor's behalf, so it passes the visitor's domain along.

**4. A platform.** A product creates one organization per customer with the platform key, runs its own frontends
on each customer's domain and renders its own email templates.

- It needs every email to say which organization it is for, including the three sign-in emails (#41).
- Its templates need to find its own customer from the organization. It reads its customer id from the
  organization's metadata.
- It set each domain itself, so it knows which customer a domain is without asking. It may ask anyway.

## Rules

- A domain belongs to one app, and so to one organization, across the whole system.
- An organization has at most one app that serves courses and at most one that serves the community.
- A new organization gets one app that serves both. The app takes the organization's name and slug. Its domain is
  the platform host (`PLATFORM_HOST`). When another app already has the platform host, or the installation has a
  platform key, its domain is the organization's slug as a subdomain of the platform host.
- A session started on an app's domain is for that app's organization.
- An app's domain reaches the API under `/api`. The browser's calls, the session cookie and the links in the
  sign-in emails all use the app's domain.
- The API reads a request's domain to know its app and organization.
- A frontend asks the API which app and organization its own domain is, with no key.

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
app has, or a second app that serves courses or the community, is a 409. So is saving the admin app's address or
the API's.

The first app is created in the same unit of work as its organization. With `PLATFORM_HOST=https://example.com`:

| The installation                                  | A new organization with the slug `acme` starts at |
| ------------------------------------------------- | ------------------------------------------------- |
| No app has `https://example.com`, no platform key | `https://example.com`                             |
| Another app has `https://example.com`             | `https://acme.example.com`                        |
| It has a platform key                             | `https://acme.example.com`                        |

A platform host that is the admin app's address or the API's counts as taken. When another app already has the
subdomain, or it is the admin app's address or the API's, creating the organization is a 409 and nothing is created.
For example, with the admin app at `https://admin.example.com`, a second organization with the slug `admin` is
refused.

Locally, with the default `PLATFORM_HOST`, the first organization is at `http://localhost:8002` and a second one
with the slug `globex` at `http://globex.localhost:8002`.

## Who owns it

An organization's apps are settings of that organization, as its two hosts are today. Organizations reads and writes
them. They are stored in their own table so that the database holds a domain to one organization. Looking a domain
up is a read of that setting, one method on the organizations service. There is no new context and no new service.

No other context calls it directly. The server hands it to whoever needs it, as it hands them the hosts today:

| Who needs it                | How it gets it                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------- |
| The sign-in adapter         | The `OrgHosts` port (`adapters/auth/src/types.ts`), which the server fills             |
| The mailer                  | A function the server hands it, `hostsOf` today (`packages/core/src/shared/mailer.ts`) |
| Identity, for three emails  | The server's sign-in hook looks the domain up and passes the organization in           |
| The route that looks one up | It calls the method and holds no logic                                                 |

## Managing apps

Organizations creates, lists, updates and deletes apps. Listing needs `organizations:read`. Creating, updating and
deleting need `organizations:write`.

The routes are under `/api/apps`, with an MCP tool for each.

The admin app has a screen for them, Settings → Apps. It lists the organization's apps and, with
`organizations:write`, adds, edits and deletes them: name, slug, domain and what the app serves.

"App" means only this. A program a person has authorised is a connected app: its routes move from
`/api/access/apps` to `/api/access/connected-apps`, and the sign-in port's `listApps` becomes `listConnectedApps`.

## Requests from an app's domain

A request carries its domain in its `Origin` header, or else its `Referer`.

- It is logged with the app's id.
- With a session for another organization it is a 401. This happens when `AUTH_COOKIE_DOMAIN` shares one cookie
  across the organizations' subdomains: Sarah signs in on Acme's domain and then opens Globex's.
- Its session cookie belongs to that domain. With `AUTH_COOKIE_DOMAIN` set to `.example.com`, an app at
  `https://acme.example.com` shares the cookie, and an app at `https://learn.acme.com` gets one of its own.

## Looking a domain up

A frontend asks which app and organization the domain it is serving is. It asks before anyone has signed in, so the
call needs no session and no key.

Sarah opens `https://learn.acme.com`. The frontend's server asks the API, sending her domain as `Origin` and her IP
address as `X-Forwarded-For`:

```
GET /api/app
Origin: https://learn.acme.com
X-Forwarded-For: 203.0.113.7

200  { "organization": { "name": "Acme" },
       "app": { "name": "Acme Academy", "courses": true, "community": false } }
```

- The API answers for the domain of the request. The call takes no domain as a parameter.
- A request that carries no domain, or a domain that is no app's, is a 404.
- It returns the organization's name, the app's name and what the app serves, and nothing else. A sign-in page on
  that domain shows the same.
- It is rate limited by the visitor's IP address, which the API reads as the sign-in rate limits do
  (`AUTH_TRUSTED_PROXIES`, `AUTH_IP_ADDRESS_HEADERS`): 100 requests in 10 seconds, then a 429 that says when to
  come back.

## The student app

One deployment serves any organization's domain, with no setting per organization.

- It looks its domain up. It shows the organization's name on the sign-in page, and returns a 404 when there is no
  app or when the app does not serve courses.
- It keeps the answer for a domain for a minute, so the renders and prefetches of a page share one lookup. A change
  to an organization's apps shows in the student app within that minute. When a lookup fails it uses the answer it
  last had.
- Its browser code calls the API at its own origin under `/api`, and the student app forwards `/api` to the API
  (`API_URL`). `NEXT_PUBLIC_API_URL` goes.
- Its server calls carry the visitor's domain as `Origin`. A read it forwards with no `Origin` gets its own domain
  as one.
- The calls it forwards and its server calls both carry the visitor's IP address as `X-Forwarded-For`, so the
  sign-in rate limits and the lookup's count each visitor and not the student app.
- It has a page to ask for a password reset, a page to set the new password, and a page to ask for a sign-in link.
  Each names its own domain as the link's return address.
- A person who is refused because they are not in the organization is told so by its name.

## Which organization a session is for

When a session is created, the API reads the domain of the sign-in: the `Origin` or `Referer` header, or the origin
of the link's return address (`requestOrigins` in `adapters/auth/src/better-auth.ts`).

| The domain is                                                     | The session                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| An app's, and the person is active in its organization            | Is for that organization                                         |
| An app's, and the person holds an open invite to its organization | Has no organization; accepting the invite sets it                |
| An app's, and the person is neither                               | Is refused: a sign-in answers 401                                |
| Any other domain, or none                                         | As today: the person's organization when they are in exactly one |

The frontend never sends an organization id, and looking a domain up returns none. Sarah signs in on
`https://learn.acme.com`:

1. She submits her email and password. The browser posts to `https://learn.acme.com/api/auth/sign-in/email`, and
   the request carries `Origin: https://learn.acme.com`.
2. The API finds the app that has that domain. The app belongs to Acme.
3. The API checks that Sarah is active in Acme and stores Acme's id on her session.
4. Every later request carries her session cookie, and the API reads the organization from the session.

A sign-in link has no form post: the session is created when the link is opened, and the domain is the origin of
the link's return address. A frontend that signs a person in from its server sends the visitor's domain as
`Origin`.

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

The mailer gets the organization, its apps and the recipient from functions the server hands it, as it gets the
hosts today.

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
- No route tells a frontend which organization a domain is. One route needs no session today: reading an invite
  by its token (`getInvite` in `packages/server/src/http/routes/organizations.ts`). The API's own routes have no
  rate limit.
- The sign-in routes are rate limited in production, per visitor IP address read from `X-Forwarded-For`
  (`AUTH_TRUSTED_PROXIES`, `AUTH_IP_ADDRESS_HEADERS`): three sign-ins in ten seconds. The student app's server
  calls send only the session cookie (`authHeaders` in `apps/student/src/lib/api/server-call.ts`).
- "App" also names a connected app (`/api/access/apps`).

## What changes

- The `apps` table replaces the two host settings and their indexes. `OrgHostSettings`, `OrgHostIndex` and
  `DrizzleOrgHostIndex` go.
- Organizations creates, lists, updates and deletes apps and looks a domain up. Creating an organization creates
  its first app in the same unit of work.
- The API gets the app routes and their MCP tools. `hosts` leaves the organization, platform and MCP organization
  payloads.
- The admin app gets its Apps screen.
- The API gets `GET /api/app`, which needs no session and no key, and a rate limit for it per visitor IP address.
- A request from an app's domain is logged with the app's id, and is a 401 with a session for another
  organization.
- A password reset link and a sign-in link that return to an app's domain are written at that domain under `/api`.
- The connected app routes and the sign-in port's method are renamed.
- The student app looks its domain up, calls the API at its own origin, sends the visitor's domain on its server
  calls and the visitor's IP address on every call, and gets its password reset and sign-in link pages.
- `isOrgHost` and `isHostOfPerson` read `apps`.
- `beforeCreateSession` sets the session's organization from the domain of the sign-in.
- An invite's `host` becomes `domain`, checked against the organization's apps.
- `TemplateContext.hosts` becomes the organization, the apps and the recipient. The templates build their links
  from the apps, and the calendar file's event page link becomes optional.
- The three sign-in emails are sent with the organization and app of their domain.
- `docs/domain/organizations.md` describes apps where it describes hosts.
- The website docs describe apps where they describe hosts: `self-hosting.mdx`, `api-keys.mdx` and
  `adapters/email/react-email.mdx` in `apps/website/content/docs`. `building-a-frontend.mdx` describes looking a
  domain up, calling the API under `/api` and where a session's organization comes from.
