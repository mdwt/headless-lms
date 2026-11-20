# Apps and domains — implementation review

Reviewed: 2026-11-20  
Branch: `feat/apps-and-domains`  
Worktree: `.claude/worktrees/hosts-doc`  
HEAD at review: `ef1ec29d` (`refactor(apps): organizations checks every app rule before writing`)  
Against: current code, `.changeset/apps-and-domains.md`, `docs/architecture.md` (Apps and domains), `docs/domain/organizations.md` (Apps / Signing in)

The old internal spec was removed (`76d86f0e`). This review treats the changeset + domain/architecture docs as the contract.

---

## Verdict

The feature is largely built and aligned with the revised design: apps table, org-owned rules, shared lookup, public `GET /api/app`, domain-scoped sessions, template context with organization, auth links on the app domain, student same-origin `/api` proxy, admin Settings → Apps, connected-apps rename, `PLATFORM_HOST` gone, new org starts with no app.

It is not ship-clean. The highest-severity product break is the **invitee who signs in on `/login` instead of `/welcome`**: they get a no-org session, login treats any session as good, member routes 401, and `/session/reset` signs them out in a loop. Several smaller auth, docs, and ops gaps remain.

---

## What landed (matches the contract)

| Area | Status | Where |
| --- | --- | --- |
| `apps` table; hosts settings/indexes gone | Done | `adapters/db/drizzle/0023_apps.sql`, schema |
| Organizations owns create/update/delete/list + reserved-domain rules | Done | `packages/core/src/organizations/apps.ts` (`OrgApps`) |
| Shared lookup any context may use | Done | `packages/core/src/shared/apps.ts` (`AppsService`) |
| New org starts with no app; no `PLATFORM_HOST` | Done | `provisionOrganization`, changeset, tests |
| CRUD `/api/apps` + MCP `list_apps` / `create_app` / … | Done | `http/routes/apps.ts`, `http/mcp/tools/apps.ts` |
| Public `GET /api/app` (Origin/Referer), skinny body, IP rate limit | Done | `routes/apps.ts`, `rate-limit.ts`, `request-domain.ts` |
| Conflict codes `domain_taken`, `domain_reserved`, `slug_taken`, `courses_taken`, `community_taken` | Done | `OrgApps`, admin form |
| Domain = bare http(s) origin; wildcards refused | Done | `domainSchema` |
| Session org from sign-in domain; invite → no org; stranger refused | Done | `sessionOrganization`, `beforeCreateSession` |
| Wrong-org session → 401 on guarded routes | Done (partial — see findings) | `plugins/auth.ts` `refuseAnotherOrganization` |
| Auth links rewritten to app domain under `/api` | Done | `better-auth.ts` `written` |
| Sign-in emails get org + app when active (#41 wiring) | Done | identity + mailer sources; bundled templates still brand-only |
| `TemplateContext`: organization, courseApp, communityApp, requestedApp, recipient | Done | `email-templates.ts`, `mailer.ts` |
| Connected apps → `/api/access/connected-apps` | Done | access routes, admin |
| Student: lookup, `/api` proxy, Origin forward, forgot/reset/sign-in-link pages | Done | `apps/student` |
| Admin Settings → Apps | Done | `apps/admin/.../settings/apps` |
| Website + architecture + organizations domain docs updated | Done | see paths above |
| Calendar omits event page when no community app | Done | reporting/member |

---

## Design shifts from the original gist

Worth knowing when reading older notes or the first review:

1. **New org no longer gets `slug.PLATFORM_HOST`.** Starts with zero apps; someone creates one via admin or `POST /api/apps`. Platforms create the org, then the app.
2. **Ownership split.** Rules/writes live in `OrgApps` (organizations). `AppsService` is lookup only. Architecture text matches this.
3. **Routes are `/api/apps`, not `/api/organizations/apps`.**
4. **Reserved installation origins** (admin, API, `CLIENT_ORIGIN`) cannot be app domains; lookup 404s them via `OrgApps.at`.
5. **Internal spec removed** from the repo; changeset is the breaking-change source of truth.

---

## Findings

### P0 — Product break

#### 1. Invitee on `/login` is signed out in a loop

**Contract:** Emma invited to Acme signs in on the course domain, accepts, and gets an Acme session. Core correctly creates a **session with no organization** when she has an open invite (`sessionOrganization`).

**Student:** `LoginView` treats any session as good and `router.replace`s to `/` (or `next`). Member routes need an org → `Choose an organization to continue` / 401 → `server-call` redirects to `/session/reset` → cookie revoked → back to login.

**Works:** `/welcome?token=` (accept before leaving).  
**Broken:** Sign in on `/login` with an outstanding invite (or any no-org session the API still creates).

**Files:** `apps/student/src/app/login/login-view.tsx`, `apps/student/src/lib/api/server-call.ts`, `apps/student/src/app/session/reset/route.ts`, `packages/core/src/organizations/service.ts` (`sessionOrganization`).

**Fix direction:** After sign-in, if session has no `activeOrganizationId`, do not send them into the member shell — send them to accept-invite / “check your email for the invite” / list pending invites. Do not revoke a no-org session that is only waiting on accept.

---

### P1 — Auth / session correctness

#### 2. Wrong-org check is not on every request from an app domain

**Contract (changeset + domain doc):** On an app’s domain, a session for another org is not accepted; a request from an app domain is logged with the app id.

**Code:** `refuseAnotherOrganization` runs only inside `requireSession` / `requireOrgSession`. It does **not** run on `/api/auth/*` (including `get-session`) or on `GET /api/app`. With `AUTH_COOKIE_DOMAIN` sharing a parent cookie, Globex can still **read** an Acme session via get-session; member routes then 401.

App id is logged when `requestApp` runs (lookup + those guards), not on arbitrary unauthenticated or auth-bridge traffic.

**Files:** `packages/server/src/http/plugins/auth.ts`, `request-domain.ts`.

#### 3. Magic-link send is not detached; password reset is

Reset / password-changed use `detached(...)` so send time and failures do not leak accounts or fail the HTTP call. Magic link `sendMagicLink` is **awaited** in the request path (`better-auth.ts`). A slow or throwing mailer changes latency and can fail the request for real members, while “not sent” for non-members returns quickly via `written` / `linkDomain`.

**Files:** `adapters/auth/src/better-auth.ts` (~312–332).

#### 4. Non-app return URL + app `Referer` can steal session org

`requestDomains` prefers callback origins, then Origin/Referer. If the link’s return address is **not** an app (e.g. admin) but the click carries an app `Referer`, `firstAt` can bind the session to that app — wrong org or a refusal — instead of the “installation origin / exactly one org” path.

**Files:** `adapters/auth/src/better-auth.ts` (`requestDomains`), `sessionOrganization`.

#### 5. Docs overstate “any other address is refused”

`docs/domain/organizations.md` says a sign-in from any address that is not an installation origin and not an app is refused. **Core** `sessionOrganization` with no matching app falls back to “exactly one org, else none.” Stranger browser origins are mostly stopped earlier by Better Auth trusted origins + `appDomains.has`, not by `sessionOrganization` itself. Align the doc with the layered enforcement, or enforce refuse-in-core.

---

### P1 — Ops / migration

#### 6. No host → apps data migration

`0023_apps` creates `apps` and drops host indexes. It does **not** copy `settings.value.hosts` into rows. Orgs that relied on hosts have **no app** until someone creates one. Sign-in, invites, and mail links for those orgs stop.

Changeset already says this; still a release blocker if any production/staging data exists under the old model. Need a one-shot backfill or an explicit “break and recreate” runbook.

---

### P2 — Product / admin UX

#### 7. Invite domain is not stored

Learner invite link uses the named domain or the courses app at send time. The domain is **not** on the invite row. Resend without `domain` retargets to the courses app even if the original mail opened the community app. Staff `domain` is validated then ignored (admin URL wins).

**Files:** `organizations/service.ts` (`inviteDomain`, `resendInvite`, `sendInviteEmail`).

#### 8. After create-org, nothing points at Apps

Correct that create sends only name/slug. Owner lands on the dashboard with zero apps; member invites 409 “create an app first.” Easy to miss Settings → Apps. Slug copy on General still sounds URL-ish without explaining apps.

#### 9. “Use a different account” on welcome accept card

Signs out but does not refresh UI; accept card remains until a 401 drops the token.

**File:** `apps/student/src/components/welcome/accept-invite-card.tsx`.

#### 10. Student does not invent `X-Forwarded-For`

`visitorHeaders` only forwards XFF when already present. Docs say the connection address is used when none is received. Without an edge that sets XFF, lookup rate limit collapses to one bucket per proxy/process.

**Files:** `apps/student/src/lib/api/visitor.ts`, self-hosting docs.

---

### P2 — Consistency / edge cases

#### 11. Reserved domains: lookup vs auth disagree on the filter

`GET /api/app` uses `OrgApps.at` (hides reserved hosts even if a row exists). Auth/session/invites use `AppsService.at` / `firstAt` (no reserved filter). Adding a customer domain to `CLIENT_ORIGIN` later makes public lookup 404 while sign-in can still bind that app. Reservation is also not a DB constraint.

#### 12. Uniqueness is origin string; reservation is host

`http://` and `https://` of the same host are two domains (can be two orgs). A non-default port of the admin host is not reserved. Docs often say “domain” meaning host; stored value is origin. Worth one explicit sentence in public docs.

#### 13. Default email templates do not show the organization

Wiring for #41 is in place (`organization`, `requestedApp` on context). Bundled password-reset / magic-link / password-changed templates still speak `brandName` only. Platforms can use the fields; out-of-box copy does not name the org.

#### 14. Rate limiter is in-process

100 / 10s per IP per API process. Fine for single-node; multi-node multiplies the budget. Accept or note in self-hosting.

#### 15. Deleting the last app is allowed

Consistent with “org can have none,” but course/community mail and learner invites then 409 or omit links. No guardrail warning in admin.

---

## Architecture check

| Rule | Assessment |
| --- | --- |
| Organizations owns app rules; routes/MCP hold no logic | Holds — `OrgApps` + thin routes |
| Shared lookup, no new context | Holds — `AppsService` |
| Server wires auth / mailer / hooks | Holds — `container.ts`, `mailer-sources.ts` |
| Permission checks in owning methods | Holds — `organizations:read` / `write` on `OrgApps` |
| Reporting reads apps, does not own them | Holds — calendar uses community app |

No new context was introduced. The earlier “apps are a shared utility” detour was corrected: writes/rules are back under organizations.

---

## Suggested order of work

1. **Fix invitee `/login` → no-org session** (P0) so Emma’s story matches the domain doc.
2. **Decide release migration:** backfill hosts → apps, or document wipe/recreate.
3. **Detach magic-link send** like reset (P1).
4. **Tighten wrong-org / get-session** under shared cookie, or document that only member routes refuse (and adjust domain doc).
5. **Store invite domain** (or always require it on resend) if community-app invites matter.
6. **Align docs:** “any other address refused,” XFF behavior, origin vs host.
7. Optionally show org name in default sign-in email templates; post-create admin nudge to Settings → Apps.

---

## Out of scope / accepted

- Community-only domains 404 in the student app (by design; no community frontend in this deployment).
- Admin still uses `NEXT_PUBLIC_API_URL` (staff app, not multi-tenant student).
- In-process rate limit without Redis (acceptable if documented).
- Empty `serves` → `invalid_input` before `domain_taken` (minor pre-check ordering).
