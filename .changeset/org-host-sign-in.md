---
"@headless-lms/core": minor
"@headless-lms/adapter-auth": minor
"@headless-lms/adapter-db": minor
"@headless-lms/server": minor
---

People can sign in from a page on any organization's host. An origin that is one of an organization's `hosts` is trusted beside the origins in `CLIENT_ORIGIN`, and a change of hosts applies from the next request, without a restart. A password reset link or magic link that returns to an organization's host is sent only to a person who is active in that organization.

The session cookie is host-only when `AUTH_COOKIE_DOMAIN` is unset: it carries no `Domain` and belongs to whichever host served the request, so the API can be served on each organization's own domain under `/api`. Set `AUTH_COOKIE_DOMAIN` to a parent domain (`.example.com`) to share the cookie across its subdomains.

Breaking: with `AUTH_COOKIE_DOMAIN` unset the cookie no longer carries the API's host as its `Domain`, so it is no longer sent to subdomains of the API's host. `OrgHostSettings` takes an `index` (`OrgHostIndex`; `DrizzleOrgHostIndex` in the database adapter), and a migration adds two indexes on `settings`. `OrganizationService` gains `isOrgHost` and `isHostOfPerson`, and `CreateAuthOptions` takes an optional `orgHosts`.
