/**
 * Seed a real owner account + organization through better-auth's HTTP API, so
 * the admin dashboard has something to sign into.
 *
 * Idempotent: re-running with an existing account signs in instead of failing,
 * and an existing organization is left as-is.
 *
 * Run (API must be running):  pnpm --filter @headless-lms/api seed:admin
 */

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const email = process.env.SEED_ADMIN_EMAIL ?? "mira@atelier.academy";
const password = process.env.SEED_ADMIN_PASSWORD ?? "password123";
const name = process.env.SEED_ADMIN_NAME ?? "Owner";
const orgName = process.env.SEED_ORG_NAME ?? "Atelier Academy";
const orgSlug = process.env.SEED_ORG_SLUG ?? "atelier";

// better-auth requires an Origin header (CSRF guard). The server's own baseURL
// is an accepted origin for server-to-server seeding.
const ORIGIN = BASE;

function cookiesFrom(res: Response): string {
  const set = res.headers.getSetCookie?.() ?? [];
  return set.map((c) => c.split(";")[0]).join("; ");
}

async function waitForServer(retries = 30): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API not reachable at ${BASE} — start it first (pnpm --filter @headless-lms/api dev).`);
}

async function main() {
  await waitForServer();

  // 1. Create the owner account (or sign in if it already exists).
  let res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password, name }),
  });
  let cookies = cookiesFrom(res);

  if (!res.ok) {
    // Likely "user already exists" — sign in to get a session instead.
    res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    });
    cookies = cookiesFrom(res);
    if (!res.ok) {
      throw new Error(`Could not sign up or sign in ${email}: ${res.status} ${await res.text()}`);
    }
    console.log(`✓ Existing account ${email} — signed in.`);
  } else {
    console.log(`✓ Created owner account ${email}.`);
  }

  if (!cookies) throw new Error("No session cookie returned by better-auth.");

  // 2. Does the org already exist for this user?
  const listRes = await fetch(`${BASE}/api/auth/organization/list`, {
    headers: { cookie: cookies, origin: ORIGIN },
  });
  const orgs = listRes.ok ? ((await listRes.json()) as Array<{ slug: string }>) : [];
  if (Array.isArray(orgs) && orgs.some((o) => o.slug === orgSlug)) {
    console.log(`✓ Organization "${orgName}" already exists — nothing to do.`);
    return;
  }

  // 3. Create the organization (creator becomes owner).
  const createRes = await fetch(`${BASE}/api/auth/organization/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies, origin: ORIGIN },
    body: JSON.stringify({ name: orgName, slug: orgSlug }),
  });
  if (!createRes.ok) {
    throw new Error(`Could not create organization: ${createRes.status} ${await createRes.text()}`);
  }
  console.log(`✓ Created organization "${orgName}" (${orgSlug}) with ${email} as owner.`);
  console.log("\nSeed complete. Sign in at the admin dashboard with:");
  console.log(`  ${email} / ${password}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
