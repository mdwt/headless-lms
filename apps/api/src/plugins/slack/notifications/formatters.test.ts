import { describe, it, expect } from "vitest";
import { formatNotification } from "./formatters.js";
import type { EnrollmentEventPayload, EventNotification } from "./schema.js";

const PAYLOAD: EnrollmentEventPayload = {
  entitlementId: "e1",
  firstName: "Ada",
  lastName: "Lovelace",
  studentEmail: "ada@example.com",
  courseId: "c1",
  courseTitle: "Calculus 101",
  grantedAt: "2026-07-01T09:00:00Z",
};

function event(type: EventNotification["type"], over?: Partial<EnrollmentEventPayload>) {
  return { type, entitlement: { ...PAYLOAD, ...over } } as EventNotification;
}

describe("formatNotification", () => {
  it("formats entitlement.granted", () => {
    const message = formatNotification(event("entitlement.granted"));
    expect(message.text).toBe("✅ Ada Lovelace enrolled in Calculus 101");
    expect(message.blocks[0]).toMatchObject({
      type: "header",
      text: { text: "✅ New enrollment" },
    });
  });

  it("formats entitlement.revoked", () => {
    const message = formatNotification(event("entitlement.revoked"));
    expect(message.text).toBe("🚫 Ada Lovelace's enrollment in Calculus 101 was revoked");
    expect(message.blocks[0]).toMatchObject({ text: { text: "🚫 Enrollment revoked" } });
  });

  it("formats entitlement.expired", () => {
    const message = formatNotification(event("entitlement.expired"));
    expect(message.text).toBe("⏳ Ada Lovelace's access to Calculus 101 has expired");
    expect(message.blocks[0]).toMatchObject({ text: { text: "⏳ Enrollment expired" } });
  });

  it("includes student, email, course and enrolment date fields", () => {
    const message = formatNotification(event("entitlement.granted"));
    const fields = (message.blocks[1] as { fields: Array<{ text: string }> }).fields;
    const texts = fields.map((f) => f.text);
    expect(texts).toEqual([
      "*Student*\nAda Lovelace",
      "*Email*\nada@example.com",
      "*Course*\nCalculus 101",
      "*Enrolled at*\n2026-07-01T09:00:00Z",
    ]);
  });

  it("adds an Expires field only when expiresAt is set", () => {
    const without = formatNotification(event("entitlement.granted"));
    expect(JSON.stringify(without.blocks)).not.toContain("*Expires*");

    const withExpiry = formatNotification(
      event("entitlement.granted", { expiresAt: "2026-12-31T00:00:00Z" }),
    );
    expect(JSON.stringify(withExpiry.blocks)).toContain("*Expires*\\n2026-12-31T00:00:00Z");
  });
});
