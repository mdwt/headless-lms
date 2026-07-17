import { describe, it, expect } from "vitest";
import { formatMessage } from "./formatters.js";
import type { EnrollmentEventPayload } from "./schema.js";

const ENROLLMENT: EnrollmentEventPayload = {
  entitlementId: "e1",
  firstName: "Ada",
  lastName: "Lovelace",
  studentEmail: "ada@example.com",
  courseId: "c1",
  courseTitle: "Calculus 101",
  grantedAt: "2026-07-01T09:00:00Z",
};

function body(type: string, over?: Partial<EnrollmentEventPayload>) {
  return { type, enrollment: { ...ENROLLMENT, ...over } };
}

describe("formatMessage", () => {
  it("formats enrollment.created", () => {
    const message = formatMessage(body("enrollment.created"));
    expect(message.text).toBe("✅ Ada Lovelace enrolled in Calculus 101");
    expect(message.blocks[0]).toMatchObject({
      type: "header",
      text: { text: "✅ New enrollment" },
    });
  });

  it("formats enrollment.updated", () => {
    const message = formatMessage(body("enrollment.updated"));
    expect(message.text).toBe("🔄 Ada Lovelace's enrollment in Calculus 101 was updated");
    expect(message.blocks[0]).toMatchObject({ text: { text: "🔄 Enrollment updated" } });
  });

  it("formats enrollment.deleted", () => {
    const message = formatMessage(body("enrollment.deleted"));
    expect(message.text).toBe("🚫 Ada Lovelace was unenrolled from Calculus 101");
    expect(message.blocks[0]).toMatchObject({ text: { text: "🚫 Enrollment removed" } });
  });

  it("formats enrollment.expired", () => {
    const message = formatMessage(body("enrollment.expired"));
    expect(message.text).toBe("⏳ Ada Lovelace's access to Calculus 101 has expired");
    expect(message.blocks[0]).toMatchObject({ text: { text: "⏳ Enrollment expired" } });
  });

  it("includes student, email, course and enrolment date fields", () => {
    const message = formatMessage(body("enrollment.created"));
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
    const without = formatMessage(body("enrollment.created"));
    expect(JSON.stringify(without.blocks)).not.toContain("*Expires*");

    const withExpiry = formatMessage(
      body("enrollment.created", { expiresAt: "2026-12-31T00:00:00Z" }),
    );
    expect(JSON.stringify(withExpiry.blocks)).toContain("*Expires*\\n2026-12-31T00:00:00Z");
  });

  it("throws on an enrollment.* body with missing metadata", () => {
    expect(() => formatMessage({ type: "enrollment.created" })).toThrow();
  });

  it("formats an unknown event type generically", () => {
    const message = formatMessage({ type: "course.published", title: "Calculus 101" });
    expect(message.text).toBe("📣 course.published");
    expect(message.blocks[0]).toMatchObject({ text: { text: "📣 course.published" } });
    expect(JSON.stringify(message.blocks[1])).toContain("Calculus 101");
  });
});
