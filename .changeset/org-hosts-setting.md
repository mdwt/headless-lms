---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-email-templates": minor
"create-headless-lms": minor
---

An organization holds where its member apps are reached: a `courses` host and a `community` host, both always set. A new organization starts with one host for both, its slug as a subdomain of the new `PLATFORM_HOST` variable (`https://example.com` gives `https://acme.example.com`), The organization carries its `hosts` wherever it is returned, and `PATCH /api/organizations` takes `hosts` to replace them. Links in emails, member invites and event calendar files use the organization's hosts at the moment the link is written: communities, spaces, posts, chats and events link to `community`, courses, lessons and downloads to `courses`.

`createInvite` and `resendInvite` take an optional `host`, the app the invite link opens; it must be one of the organization's hosts.

Breaking: `STUDENT_PORTAL_URL` and `Config.studentPortalUrl` are removed; set `PLATFORM_HOST` (`Config.platformHost`) instead. The slug sent to `POST /api/organizations` must be lowercase letters, numbers and hyphens, at most 50 characters. `TemplateContext.studentPortalUrl` is replaced by `TemplateContext.hosts` (`{ courses, community }`, `null` for an email sent outside an organization), `Mailer.send` takes the organization id as its fourth argument in place of a context override, and `MemberReportServiceParams.studentPortalUrl` is replaced by `hosts`.
