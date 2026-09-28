import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "./credentials.js";

const key = randomBytes(32);
const aad = Buffer.from("org_1:crd_1", "utf8");

describe("credential store crypto", () => {
  it("round-trips plaintext", () => {
    const payload = encryptSecret(key, "sk_live_abc123", aad);
    expect(decryptSecret(key, payload, aad)).toBe("sk_live_abc123");
  });

  it("produces a different ciphertext per call (random IV)", () => {
    expect(encryptSecret(key, "x", aad)).not.toBe(encryptSecret(key, "x", aad));
  });

  it("fails when the ciphertext is tampered with", () => {
    const payload = Buffer.from(encryptSecret(key, "secret", aad), "base64");
    const last = payload.length - 1;
    payload.writeUInt8(payload.readUInt8(last) ^ 0xff, last);
    expect(() => decryptSecret(key, payload.toString("base64"), aad)).toThrow();
  });

  it("fails under a different AAD (ciphertext moved to another org/row)", () => {
    const payload = encryptSecret(key, "secret", aad);
    expect(() => decryptSecret(key, payload, Buffer.from("org_2:crd_1", "utf8"))).toThrow();
  });

  it("fails with the wrong key", () => {
    const payload = encryptSecret(key, "secret", aad);
    expect(() => decryptSecret(randomBytes(32), payload, aad)).toThrow();
  });

  it("handles empty and unicode plaintext", () => {
    for (const value of ["", "pässwörd — 秘密 🔐"]) {
      expect(decryptSecret(key, encryptSecret(key, value, aad), aad)).toBe(value);
    }
  });
});
