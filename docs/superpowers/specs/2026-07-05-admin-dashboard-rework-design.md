# Admin Dashboard Rework — Target Architecture & Design

Date: 2026-07-05
App: `apps/admin` (Next 16 App Router, React 19, TanStack Query v5, TanStack Table v8, better-auth ^1.2)
Status: design (full rewrite; no existing users, no migration/back-compat)

## 0. Goals

Rebuild the admin back-office the "proper" way:

1. **Best-practice better-auth with SSR** — session validated on the server via the cross-origin shared-cookie model. No proxy, no Next rewrites.
2. **Server auth middleware + server-side checks** — a Next `middleware.ts` guards the `(dashboard)` route group; a server session/org/role resolver runs in Server Components.
3. **SSR of ALL pages** — every page is a Server Component that fetches (with cookie forwarding) and hydrates.
4. **Best-practice TanStack Query** — per-request server QueryClient, `prefetchQuery` in the Server Component, `dehydrate` + `<HydrationBoundary>`, client hooks reuse the hydrated cache. Mutations/optimistic updates stay client-side.
5. **Best-practice TanStack Table** — all table state (page/sort/search/faceted filters/visibility) driven from URL `searchParams` so the server renders the correct page; TanStack in manual mode; per-page column defs extracted into their own modules; a reusable list-table shell + a URL-state hook.

The single hard constraint from the origin decision: **the frontend and the API stay on separate origins, and auth works cross-origin via cookies.** No proxy, no `next.config` rewrites, no better-auth running inside Next.

---

## 1. Architecture overview

```
Browser ──(cookie: better-auth.session_token, credentials:include)──▶ API  (Fastify, :8000)
   │                                                                    ▲
   │  same cookie is ALSO sent to the Next server (cookies are not      │ get-session / get-active-member
   │  port-scoped in dev; Domain=.example.com in prod)                  │ (Next server forwards the raw cookie)
   ▼                                                                    │
Next server (:8001) ── middleware (edge cookie gate) ── (dashboard)/layout (server session resolver)
                                       │                        │
                                       │                        ├─ Server Component page.tsx: prefetchQuery(cookie-forwarded fetch) → dehydrate
                                       ▼                        ▼
                              redirect /login          <HydrationBoundary> → client island (hooks reuse cache)
```

Three layers of auth enforcement, cheapest-first:

- **Edge middleware** — cheap cookie-presence gate on `(dashboard)/*`. Redirects to `/login` when the session cookie is absent. Does NOT validate (no network at the edge on the hot path).
- **Server layout resolver** — the `(dashboard)` layout is a Server Component. It forwards the incoming cookie to the API's `get-session` (+ `get-active-member`) and *validates* the session, resolving `{ user, organization, role }`. Unauthenticated → `redirect('/login')`; no org → render the org-creation client island; no active org → render an org-activator client island; else render the app shell + a thin client `SessionProvider` seeded with the server-resolved session.
- **API** — the real authority. Every route already runs `requireSession` + `resolveScope`, deriving org + role from the session cookie server-side. UI gating is defense-in-depth only.

Data flow: Server Components fetch through a **request-scoped server API layer** that reads `cookies()` from `next/headers` and passes `{ headers: { cookie } }` into each SDK call (never mutating the module-level SDK singleton). Results are prefetched into a **per-request** QueryClient, dehydrated, and handed to client islands via `<HydrationBoundary>`. Client hooks use the *same query keys* and the *same `api` functions* (which in the browser send the cookie via `credentials:include`), so the first client render hits the hydrated cache with zero refetch.

---

## 2. Cross-origin cookie auth flow

### 2.1 The cookie mechanics (why no proxy is needed)

better-auth's session cookie is set by the API on `*.api origin* `. Cookies are **not port-scoped**: in local dev the cookie set for host `localhost` (from `http://localhost:8000`) is sent by the browser to `http://localhost:8001` (Next) and `http://localhost:8000` (API) alike — same site by hostname. In production a shared parent domain (`Domain=.example.com`) makes `admin.example.com` and `api.example.com` share the cookie. So:

- The **browser** already carries the cookie to both origins.
- The **Next server** receives the cookie on the incoming request (SSR/middleware) and can read it via `next/headers`, then **forward it** to the API's `get-session` endpoint to validate — that is the entire server-side auth mechanism. No proxy, no rewrite.

### 2.2 Required `apps/api` auth-config change (the ONLY API edit permitted)

Two coordinated changes, both driven by env/config — no contract or route changes.

**(a) Trusted origins + CORS** — the Next admin origin must be in `CLIENT_ORIGIN` (it flows into both `trustedOrigins` and the CORS allowlist in `apps/api/src/http/server.ts` `loadConfig`). CORS `credentials:true` is already set. Ensure `CLIENT_ORIGIN` includes the admin origin `http://localhost:8001` (dev) and the prod admin origin. This is config, not code: set root `.env` `CLIENT_ORIGIN=http://localhost:8001,http://localhost:8002`. No server.ts change is strictly required if the env is correct; verify `8001` is present.

**(b) Cross-subdomain / same-site cookie attributes** — add an explicit cookie config to `createAuth` in `apps/api/src/adapters/auth/index.ts`. Today `advanced` only sets `database.generateId`; there is NO cookie config, so better-auth defaults apply (sameSite=lax, secure only in prod, no Domain). For local dev sameSite=lax already works cross-port. For prod cross-subdomain, add:

```ts
advanced: {
  database: { generateId: ({ model }) => prefixId(AUTH_ID_PREFIXES[model] ?? "id") },
  // NEW — cross-subdomain shared cookie for admin/api/web on one parent domain.
  crossSubDomainCookies: {
    enabled: true,
    // e.g. ".example.com" in prod; leave unset/undefined in local dev so the
    // host-only localhost cookie is used (works cross-port already).
    domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
  },
  defaultCookieAttributes: {
    sameSite: "lax",           // "none" + secure:true only if truly cross-SITE in prod
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  },
},
```

Add `AUTH_COOKIE_DOMAIN` to the root `.env`/`.env.example` (empty in dev, `.example.com` in prod). Keep `sameSite=lax` for the shared-parent-domain case (same-site). Only switch to `sameSite=none; secure` if admin and api are genuinely cross-site (different registrable domains) — not the case with the shared-parent-domain plan.

> Cookie-name sync: the forwarded cookie header is opaque to the Next server (it forwards the whole `Cookie:` header), so adding `crossSubDomainCookies` does not require the Next side to know the cookie name. Keep it that way — forward the raw header, never reconstruct by name.

### 2.3 Next middleware (edge gate)

`apps/admin/src/middleware.ts` (NEW):

```ts
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_HINTS = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function middleware(req: NextRequest) {
  const hasSession = SESSION_COOKIE_HINTS.some((n) => req.cookies.has(n));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard the dashboard group only; login and static assets pass through.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api).*)"],
};
```

Rationale: the edge check is **presence-only** (fast, no fetch). Real validation (expired/invalid cookie, org, role) happens in the server layout which already does a network round-trip it needs anyway for session data. This avoids double-fetching on the edge hot path while still bouncing obviously-unauthenticated deep links instantly.

### 2.4 Server session resolver (Server Components)

`apps/admin/src/lib/auth/server-session.ts` (NEW, server-only — `import "server-only"`):

```ts
import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ServerSession = {
  user: { id: string; name: string; email: string; image: string | null };
  organization: { id: string; name: string; slug: string } | null;
  role: "owner" | "admin" | "instructor";
  status: "authenticated" | "no-organization" | "no-active-org";
};

// React.cache => one resolution per request, shared across layout + pages.
export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();            // { user, session } | null
  if (!data?.user) return null;

  const activeOrgId = data.session?.activeOrganizationId ?? null;

  // Role requires the org plugin's active member (get-session alone lacks role).
  let role: ServerSession["role"] = "instructor";
  let organization: ServerSession["organization"] = null;
  let status: ServerSession["status"] = "no-organization";

  if (activeOrgId) {
    const [memberRes, orgRes] = await Promise.all([
      fetch(`${API_URL}/api/auth/organization/get-active-member`, { headers: { cookie }, cache: "no-store" }),
      fetch(`${API_URL}/api/auth/organization/get-full-organization`, { headers: { cookie }, cache: "no-store" }),
    ]);
    if (memberRes.ok) {
      const m = await memberRes.json();
      role = ["owner", "admin", "instructor"].includes(m?.role) ? m.role : "instructor";
    }
    if (orgRes.ok) {
      const o = await orgRes.json();
      if (o?.id) organization = { id: o.id, name: o.name, slug: o.slug };
    }
    status = "authenticated";
  } else {
    // Authenticated but no active org selected yet. Distinguish "has orgs but
    // none active" from "no orgs at all" so the layout can either activate or
    // prompt to create.
    const listRes = await fetch(`${API_URL}/api/auth/organization/list`, { headers: { cookie }, cache: "no-store" });
    const orgs = listRes.ok ? await listRes.json() : [];
    status = Array.isArray(orgs) && orgs.length > 0 ? "no-active-org" : "no-organization";
  }

  return {
    user: { id: data.user.id, name: data.user.name, email: data.user.email, image: data.user.image ?? null },
    organization,
    role,
    status,
  };
});
```

Notes:

- Wrapped in `React.cache` so the layout and every page in the same request share one resolution (no duplicate fetches).
- Handles the **no-active-org** case that today is papered over by a client `setActive` effect: the server can't set a cookie mid-render, so it renders a small client `OrgActivator` island that calls `authClient.organization.setActive({ organizationId })` then `router.refresh()`. This preserves the current auto-activate behavior without a client-only gate.
- Uses `API_URL` (server var) with fallback to `NEXT_PUBLIC_API_URL` — add an optional server-only `API_URL` to `.env` for deploys where the browser origin and server-to-API origin differ.

### 2.5 Server layout (server-first gate)

`apps/admin/src/app/(dashboard)/layout.tsx` (REWRITE, Server Component):

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/server-session";
import { AppShell } from "@/components/app-shell/app-shell";
import { SessionProvider } from "@/lib/auth/session-context";
import { CreateOrganization } from "@/lib/auth/create-organization";  // client island (Foundations)
import { OrgActivator } from "@/lib/auth/org-activator";              // client island (Foundations)

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.status === "no-organization") return <CreateOrganization />;
  if (session.status === "no-active-org") return <OrgActivator />;

  // status === "authenticated" — org + role resolved server-side.
  return (
    <SessionProvider session={session}>
      <AppShell user={session.user} organization={session.organization!} role={session.role}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
```

- The layout is now **server-first**. The client `SessionProvider` becomes a thin context that is *seeded from the server-resolved session* (no more 4-hook client stitching, no `useDashboardSession`). It still exposes `useCurrentUser()/useOrganization()/useCaller()` for client components, but the values come from props, not from live better-auth hooks.
- `AppShell` and its children (`SidebarNav`, `UserMenu`, mobile Sheet) may stay client (interactive), receiving `user/organization/role` as props.

### 2.6 Login (client, unchanged model)

`apps/admin/src/app/login/*` stays a client view using the better-auth react client (`signIn.email`, `signUp.email`, then `api.createOrganization` on signup). On success it navigates to `next` (from the middleware redirect) or `/`. The browser client keeps `credentials:include`. Foundations owns the login rewrite and the trimmed `lib/auth/client.ts` (react client for browser-side sign-in/out + org mutations only; `useDashboardSession` is deleted).

---

## 3. Data / hydration pattern

### 3.1 Request-scoped server fetching (cookie forwarding)

The SDK `client` is a **module-level singleton** with a global `credentials:include`. On the server this is shared across all concurrent requests/users — mutating it to attach a per-request cookie would **leak cookies between users**. Instead, the SDK's per-call `Options` accepts `headers` (and a per-call `client`/`fetch`), which spread into the request. So the server passes the cookie per call.

`apps/admin/src/lib/api/server.ts` (NEW, `import "server-only"`):

```ts
import "server-only";
import { cookies } from "next/headers";
import { configureSdk } from "@headless-lms/sdk";
// ... resource classes

let configured = false;
function ensureConfigured() {
  if (configured) return;
  configureSdk({ baseUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000" });
  configured = true;
}

async function cookieHeader() {
  return { cookie: (await cookies()).toString() };
}

// A server mirror of the browser `api`, but every call threads the cookie header.
export const serverApi = {
  async overview() {
    ensureConfigured();
    return unwrap(await Dashboard.getOverview({ headers: await cookieHeader() }));
  },
  async listCourses(params: ListParams) {
    ensureConfigured();
    return unwrap(await Courses.listCourses({ query: toQuery(params, ["status", "category"]), headers: await cookieHeader() }));
  },
  // ...one method per SSR-prefetched query, reusing toQuery/unwrap.
};
```

- `toQuery`, `unwrap`, `ApiError` are **extracted into `lib/api/shared.ts`** so both `sdk.ts` (browser `api`) and `server.ts` (`serverApi`) import them — no duplication, identical query serialization (critical: prefetch keys must match client keys exactly).
- Never call `client.setConfig` with request state on the server. `configureSdk` sets baseUrl only (no credentials needed server-side; the cookie is per-call).
- 401 on the server has no global handler (the client QueryClient's onError does): SSR prefetch that throws `ApiError(401)` is caught in the page and turned into `redirect('/login')` (belt-and-suspenders with middleware); 403 → render the client island which shows `TableForbidden`.

### 3.2 React-Query SSR hydration

`apps/admin/src/lib/query/server-query-client.ts` (NEW):

```ts
import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { cache } from "react";

// One QueryClient per request (React.cache dedupes within a request).
export const getServerQueryClient = cache(
  () => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      dehydrate: { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) },
    },
  }),
);
```

`apps/admin/src/app/providers.tsx` (REWRITE) keeps the **browser** QueryClient (the existing one with 401→signOut, retry rules, refetchOnWindowFocus:false) created once via `useState`, and additionally wraps children in `<HydrationBoundary state={...}>` — but the dehydrated state is passed **per page**, not globally. So the pattern per Server Component page is:

```tsx
// courses/page.tsx (Server Component)
export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]>> }) {
  const sp = await searchParams;
  const params = parseListParams(sp, { pageSize: 10, initialSort: [{ id: "updatedAt", desc: true }] });
  const qc = getServerQueryClient();
  await qc.prefetchQuery({
    queryKey: qk.courses.list(params, "all"),
    queryFn: () => serverApi.listCourses(params),
  });
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CoursesTable initialParams={params} />
    </HydrationBoundary>
  );
}
```

- The client island (`CoursesTable`) calls `useCourses(params)` with the **same params object shape** → same `qk.courses.list(params, "all")` key → hits the hydrated cache, no refetch on first paint.
- Only the **current URL page** is prefetched server-side (page/sort/search/filters all come from `searchParams`), so the server renders exactly what the URL asks for — deep links and reloads are correct and SSR'd.
- Browser-only queries (`useAssetUrl`, presigned `uploadAsset`) are **never** prefetched; they run client-side only.
- Mutations + optimistic updates stay entirely client-side in `hooks.ts` (unchanged convention: hooks own the `toast` on success/error, invalidations, and the two optimistic flows `useToggleCoursePublish` / `useUpdateMemberRole`).

---

## 4. Table / URL-state pattern

### 4.1 Decision: hand-roll with `useSearchParams` + `router.replace` (NOT nuqs)

`nuqs` is not installed. Rather than add a dependency, hand-roll a single URL-state hook because: (a) we need precise control over the **atomic multi-key write** (changing a filter must also reset `page=1` in the same URL write) and over the **functional-updater** contract TanStack requires; (b) we must use `router.replace` (not `push`) and debounce search to avoid history spam; (c) the surface is one hook reused by all list pages, so the abstraction cost is low and stays in-repo. Adding nuqs would still require the same custom serialization for `ColumnFiltersState`/`SortingState`, so it buys little.

### 4.2 `use-data-table.ts` rewrite (URL-backed, same public shape)

Rewrite **only the internals** of `apps/admin/src/components/data-table/use-data-table.ts`. The returned `DataTableState` shape (`params` + the 7 value/setter pairs) and the `ListParams` derivation are **preserved exactly**, so `data-table.tsx` and all sub-components need zero changes.

URL schema (query string):
- `page` → integer (omit when 1)
- `pageSize` → integer (omit when default)
- `q` → search string (omit when empty)
- `sort` → `-field` / `field` primary sort (single, matches API + `toQuery`); multi-sort serialized as comma list `field,-other` and parsed back into `SortingState`
- `f_<columnId>` → repeated/comma values per faceted filter → reconstructed into `ColumnFiltersState` `{id, value: string[]}[]` AND the derived `filters` map
- **column visibility stays client-side** (localStorage keyed by route), NOT in the URL — it is a per-user preference, not a query input (not in `ListParams`), and serializing a `VisibilityState` into the URL is noisy. This matches current behavior (visibility isn't in `ListParams`).

Setter contract (must handle TanStack's `Updater<T>` = value | `(old)=>new`):

```ts
function setSorting(updater: Updater<SortingState>) {
  const next = typeof updater === "function" ? updater(currentSorting) : updater;
  writeUrl({ sort: serializeSort(next), page: undefined }); // sort change resets page (preserve today's behavior)
}
```

- Every setter resolves the functional-updater against current URL-derived state **before** serializing (else shift-click multi-sort and facet toggles silently break).
- Filter/search/pageSize/sort changes perform an **atomic** `writeUrl` that also clears `page` (page-1 reset), replacing today's `resetKey` effect. Sorting stays in the reset set (sort change → page 1), matching current behavior.
- Search keeps the **debounced split**: the input value stays in local `useState` for responsiveness; only the 250ms-debounced value is pushed to the URL via `router.replace` (no per-keystroke history entry, no per-keystroke refetch).
- Reads via `useSearchParams()` (requires the client island to be under a Suspense boundary — each page's client island is wrapped by the Server Component's `<HydrationBoundary>`; add a `<Suspense>` in the island if Next demands it).
- Honors `initialSort`/`pageSize` opts as **defaults-when-absent-from-URL** so existing call sites (`useDataTable({ pageSize, initialSort })`) keep working.

`apps/admin/src/lib/table/parse-list-params.ts` (NEW, isomorphic): a pure parser `parseListParams(searchParams, defaults) → ListParams` used by **both** the Server Component (to build the prefetch key/params) and `use-data-table.ts` (to seed initial state). This guarantees server prefetch params and client hook params are byte-identical → cache hit.

### 4.3 Generic list-table shell

`data-table.tsx` stays the generic shell (manual pagination/sorting/filtering, faceted filters, view-options, skeleton/empty/error/forbidden states, 403 detection). Its props are unchanged. Per-page **column defs** are extracted into `*-columns.tsx(x)` modules owned by each page (students already has one; add `courses-columns`, `members-columns`, `entitlements-columns`).

---

## 5. Per-page shape

Every list page becomes:

```
route/page.tsx        — Server Component: await searchParams → parseListParams → prefetchQuery(serverApi.*) → <HydrationBoundary><XxxTable/></HydrationBoundary>
route/xxx-table.tsx   — "use client" island: useDataTable(URL) + useXxx(params) + <DataTable columns={cols} .../> + mutations
route/xxx-columns.tsx — column defs (ColumnDef<T>[]), role-gated cells via server-provided role prop / useCaller()
route/_components/*   — existing sheets/dialogs (create/edit/invite/grant) stay client, wired to mutation hooks
```

Detail/builder pages become:

```
route/[id]/page.tsx   — Server Component: prefetch detail (+ sub-resources) → HydrationBoundary → client island
route/[id]/xxx-view.tsx — "use client": useXxx(id) etc. (hydrated), interactive parts (dnd-kit builder) stay client
```

Role gating: managers = owner|admin (from server-resolved role passed down). Manager-only pages (students, entitlements, members) gate at **two** levels: (a) the Server Component checks `getServerSession().role`/`status` and can `notFound()`/redirect non-managers, and (b) the client island still renders `ForbiddenView`/`TableForbidden` on a 403 as defense-in-depth. Instructor course-scoping (`scopedCourseIds`) remains sourced from the API, not the session (today hardcoded `[]`); keep the `can.editCourse(user, courseId)` seam but note scoping is not wired.

---

## 6. File-by-file plan

### 6.1 FOUNDATIONS (shared — built FIRST, single agent; page-agents depend on these)

**Auth (server + client split)**
- NEW `apps/admin/src/lib/auth/server-session.ts` — `getServerSession()` (React.cache), forwards cookie to get-session + get-active-member + get-full-organization + org list. Server-only.
- EDIT `apps/admin/src/lib/auth/client.ts` — keep the better-auth react client (`signIn/signOut/signUp/organization/useSession`) for browser sign-in/out + org mutations; **delete** `useDashboardSession` and the `Session` stitching. Client-only.
- REWRITE `apps/admin/src/lib/auth/session-context.tsx` — `SessionProvider` seeded by server-resolved `{user,organization,role}` props; `useCurrentUser/useOrganization/useCaller` read from context (no live hooks).
- NEW `apps/admin/src/lib/auth/create-organization.tsx` — client island (moved out of `(dashboard)/_components/create-organization.tsx`), rendered by the server layout for `no-organization`. Calls `api.createOrganization` then full reload.
- NEW `apps/admin/src/lib/auth/org-activator.tsx` — client island for `no-active-org`: `authClient.organization.setActive` then `router.refresh()`.
- EDIT `apps/admin/src/lib/roles.ts` — keep `isManager`/`can.*`/`visibleNav`/`ROLE_*`; drive from the server-provided role. Decide `canAccessDashboard` (currently always true — confirm student behavior; if students have no admin access, enforce here + in middleware/layout).

**Auth config (API — the only apps/api edit)**
- EDIT `apps/api/src/adapters/auth/index.ts` — add `advanced.crossSubDomainCookies` + `defaultCookieAttributes` (sameSite=lax, secure in prod, httpOnly) as in §2.2.
- EDIT root `.env` / `.env.example` — ensure `CLIENT_ORIGIN` includes `http://localhost:8001`; add `AUTH_COOKIE_DOMAIN` (empty dev) and optional server-only `API_URL` for admin.
- (No `server.ts` code change required if `CLIENT_ORIGIN` env is correct; CORS `credentials:true` + trustedOrigins already derive from it.)

**Middleware / config**
- NEW `apps/admin/src/middleware.ts` — edge cookie-presence gate on `(dashboard)/*`, redirect to `/login?next=…` (§2.3).
- EDIT `apps/admin/next.config.ts` — unchanged except confirming NO rewrites/redirects; keep `transpilePackages:["@headless-lms/sdk"]`.

**Data layer**
- NEW `apps/admin/src/lib/api/shared.ts` — extract `unwrap`, `expectOk`, `toQuery`, `ApiError` re-export (from `http.ts`) so browser + server share identical logic.
- EDIT `apps/admin/src/lib/api/sdk.ts` — browser `api`; import shared helpers; unchanged behavior (credentials:include).
- NEW `apps/admin/src/lib/api/server.ts` — `serverApi` mirror, per-call cookie forwarding via `next/headers`; only SSR-prefetched read methods. Server-only.
- EDIT `apps/admin/src/lib/api/hooks.ts` — unchanged query keys/hooks; keep optimistic mutations + toasts. (No SSR logic here.)
- `apps/admin/src/lib/query-keys.ts` — unchanged (keys reused by server prefetch).

**Query hydration**
- NEW `apps/admin/src/lib/query/server-query-client.ts` — per-request `QueryClient` via React.cache (§3.2).
- REWRITE `apps/admin/src/app/providers.tsx` — keep browser QueryClient (401→signOut, retry, no refetchOnWindowFocus); ensure it is created once and is compatible with per-page `<HydrationBoundary>` in each Server Component.

**Table shell + URL state**
- REWRITE `apps/admin/src/components/data-table/use-data-table.ts` — URL-backed internals, same `DataTableState` shape + `ListParams` derivation; functional-updater-safe setters; debounced search; atomic page-reset writes; visibility in localStorage (§4.2).
- NEW `apps/admin/src/lib/table/parse-list-params.ts` — isomorphic `parseListParams(searchParams, defaults) → ListParams` (used by Server Components + the hook).
- `data-table.tsx`, `column-header.tsx`, `faceted-filter.tsx`, `pagination.tsx`, `row-actions.tsx`, `states.tsx`, `view-options.tsx` — UNCHANGED (public API preserved).

**Shell / layout**
- REWRITE `apps/admin/src/app/(dashboard)/layout.tsx` — Server Component gate (§2.5).
- EDIT `apps/admin/src/components/app-shell/app-shell.tsx` (+ `nav.ts`, `logo.tsx`, `sidebar-nav.tsx`) — accept `user/organization/role` as props instead of reading `useDashboardSession`.
- EDIT `apps/admin/src/app/login/login-view.tsx` + `login/page.tsx` — read `next` param, navigate on success; browser client unchanged.
- `apps/admin/src/app/layout.tsx` — wraps `<Providers>`; unchanged.

### 6.2 PER-PAGE (each agent owns ONE route directory; built AFTER Foundations)

See the structured `pages` array for exact dir ownership and rebuild spec. Each list page = Server Component `page.tsx` (searchParams → prefetch → HydrationBoundary) + client `*-table.tsx` island + `*-columns` module + existing `_components` sheets. Detail/builder pages = Server Component `page.tsx` (prefetch detail + sub-resources) + client view island; interactive dnd-kit/builder parts stay client. Media and Connected-Apps are bespoke (not DataTable) — SSR the initial list, hydrate, keep upload/presigned/drag-drop and the hand-rolled table client.

---

## 7. Risks carried forward (must preserve in the rewrite)

- **Cookie-name/attr sync**: forward the raw `Cookie:` header server-side; never reconstruct by cookie name so `crossSubDomainCookies`/prefix changes don't break SSR validation.
- **No cookie leak on server**: never `client.setConfig` with request state; always per-call `headers:{cookie}`.
- **Prefetch key === client key**: server and client must build `ListParams` via the same `parseListParams` and the same `toQuery`, or the client refetches (cache miss).
- **Functional-updater setters**: URL setters must resolve `Updater<T>` before serializing (multi-sort, facet toggles).
- **Atomic page reset**: filter/search/sort/pageSize writes reset `page=1` in the same URL write (replaces `resetKey` effect).
- **No-active-org path**: server can't `setActive`; render `OrgActivator` client island (mirrors today's auto-activate).
- **Role needs the org plugin**: get-session alone lacks role; resolver also calls get-active-member.
- **Manager gating duplicated**: preserve every per-page guard (server check + client `ForbiddenView`/`TableForbidden`).
- **Mutation toasts live in hooks**: keep the convention (components rely on hooks to toast).
- **Browser-only flows excluded from SSR**: `useAssetUrl`, presigned `uploadAsset` stay client, never prefetched.
- **Reconcile course-edit forms**: `course-form-sheet` (Select category) vs `course-details-sheet` (free-text) — unify category input.
