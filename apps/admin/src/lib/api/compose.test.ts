import { afterEach, describe, expect, it, vi } from "vitest";

import { entitlementStatusOf } from "./compose";
import type { EntitlementGrant } from "./types";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function grant(over: Partial<EntitlementGrant>): EntitlementGrant {
  return { status: "active", expiresAt: null, ...over } as EntitlementGrant;
}

describe("entitlementStatusOf", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads a grant as expired at its expiry and active strictly before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(entitlementStatusOf(grant({ expiresAt: NOW.toISOString() }))).toBe("expired");
    expect(
      entitlementStatusOf(grant({ expiresAt: new Date(NOW.getTime() + 1).toISOString() })),
    ).toBe("active");
    expect(entitlementStatusOf(grant({ status: "revoked", expiresAt: null }))).toBe("revoked");
  });
});
