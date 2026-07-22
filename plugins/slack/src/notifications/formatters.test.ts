import { describe, it, expect } from "vitest";
import { formatMessage } from "./formatters.js";
import type { EntitlementEventPayload } from "./schema.js";

const ENTITLEMENT: EntitlementEventPayload = {
  id: "e1",
  firstName: "Ada",
  lastName: "Lovelace",
  studentEmail: "ada@example.com",
  content: { id: "c1", type: "course", title: "Calculus 101" },
  grantedAt: "2026-07-01T09:00:00Z",
};

function body(type: string, over?: Partial<EntitlementEventPayload>) {
  return { type, entitlement: { ...ENTITLEMENT, ...over } };
}

describe("formatMessage", () => {
  it("formats entitlement.created", () => {
    const message = formatMessage(body("entitlement.created"));
    expect(message.text).toBe("✅ Ada Lovelace enrolled in Calculus 101");
    expect(message.blocks[0]).toMatchObject({
      type: "header",
      text: { text: "✅ New entitlement" },
    });
  });

  it("uses neutral grant copy for non-course content", () => {
    const message = formatMessage(
      body("entitlement.created", {
        content: { id: "p1", type: "podcast", title: "The Craft Hour" },
      }),
    );
    expect(message.text).toBe("✅ Ada Lovelace granted access to The Craft Hour");
  });

  it("formats entitlement.updated", () => {
    const message = formatMessage(body("entitlement.updated"));
    expect(message.text).toBe("🔄 Ada Lovelace's access to Calculus 101 was updated");
    expect(message.blocks[0]).toMatchObject({ text: { text: "🔄 Entitlement updated" } });
  });

  it("formats entitlement.deleted", () => {
    const message = formatMessage(body("entitlement.deleted"));
    expect(message.text).toBe("🚫 Ada Lovelace's access to Calculus 101 was revoked");
    expect(message.blocks[0]).toMatchObject({ text: { text: "🚫 Entitlement removed" } });
  });

  it("formats entitlement.expired", () => {
    const message = formatMessage(body("entitlement.expired"));
    expect(message.text).toBe("⏳ Ada Lovelace's access to Calculus 101 has expired");
    expect(message.blocks[0]).toMatchObject({ text: { text: "⏳ Entitlement expired" } });
  });

  it("includes student, email, content and grant date fields", () => {
    const message = formatMessage(body("entitlement.created"));
    const fields = (message.blocks[1] as { fields: Array<{ text: string }> }).fields;
    const texts = fields.map((f) => f.text);
    expect(texts).toEqual([
      "*Student*\nAda Lovelace",
      "*Email*\nada@example.com",
      "*Course*\nCalculus 101",
      "*Granted at*\n2026-07-01T09:00:00Z",
    ]);
  });

  it("adds an Expires field only when expiresAt is set", () => {
    const without = formatMessage(body("entitlement.created"));
    expect(JSON.stringify(without.blocks)).not.toContain("*Expires*");

    const withExpiry = formatMessage(
      body("entitlement.created", { expiresAt: "2026-12-31T00:00:00Z" }),
    );
    expect(JSON.stringify(withExpiry.blocks)).toContain("*Expires*\\n2026-12-31T00:00:00Z");
  });

  it("throws on an entitlement.* body with missing metadata", () => {
    expect(() => formatMessage({ type: "entitlement.created" })).toThrow();
  });

  it("formats an unknown event type generically", () => {
    const message = formatMessage({ type: "course.published", title: "Calculus 101" });
    expect(message.text).toBe("📣 course.published");
    expect(message.blocks[0]).toMatchObject({ text: { text: "📣 course.published" } });
    expect(JSON.stringify(message.blocks[1])).toContain("Calculus 101");
  });
});
