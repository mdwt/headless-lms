import { describe, expect, it } from "vitest";

import { shortLived } from "./short-lived";

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

function counted<T>(answer: (call: number) => T | Promise<T>) {
  let calls = 0;
  return { load: async () => answer(++calls), calls: () => calls };
}

describe("shortLived", () => {
  it("loads a key once while its answer is fresh, and again once it has lapsed", async () => {
    const time = clock();
    const keep = shortLived<string>({ ttlMs: 60_000, max: 10, now: time.now });
    const acme = counted((call) => `acme ${call}`);

    expect(await keep("https://learn.acme.com", acme.load)).toBe("acme 1");
    time.advance(59_999);
    expect(await keep("https://learn.acme.com", acme.load)).toBe("acme 1");
    time.advance(1);
    expect(await keep("https://learn.acme.com", acme.load)).toBe("acme 2");
    expect(acme.calls()).toBe(2);
  });

  it("keeps each key on its own, and keeps an empty answer too", async () => {
    const keep = shortLived<string | null>({ ttlMs: 60_000, max: 10, now: clock().now });
    const nobody = counted(() => null);
    expect(await keep("https://learn.acme.com", async () => "acme")).toBe("acme");
    expect(await keep("https://nobody.example", nobody.load)).toBeNull();
    expect(await keep("https://nobody.example", nobody.load)).toBeNull();
    expect(await keep("https://learn.acme.com", async () => "other")).toBe("acme");
    expect(nobody.calls()).toBe(1);
  });

  it("shares one load between requests that arrive together", async () => {
    const keep = shortLived<string>({ ttlMs: 60_000, max: 10, now: clock().now });
    const acme = counted(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("acme"), 5)),
    );
    const answers = await Promise.all(
      [1, 2, 3].map(() => keep("https://learn.acme.com", acme.load)),
    );
    expect(answers).toEqual(["acme", "acme", "acme"]);
    expect(acme.calls()).toBe(1);
  });

  it("does not keep a failure", async () => {
    const keep = shortLived<string>({ ttlMs: 60_000, max: 10, now: clock().now });
    const flaky = counted((call) => {
      if (call === 1) throw new Error("429");
      return "acme";
    });
    await expect(keep("https://learn.acme.com", flaky.load)).rejects.toThrow("429");
    expect(await keep("https://learn.acme.com", flaky.load)).toBe("acme");
  });

  it("returns the last answer when a reload fails, and reloads on the next request", async () => {
    const time = clock();
    const keep = shortLived<string>({ ttlMs: 60_000, max: 10, now: time.now });
    const flaky = counted((call) => {
      if (call === 2) throw new Error("429");
      return `acme ${call}`;
    });
    expect(await keep("https://learn.acme.com", flaky.load)).toBe("acme 1");
    time.advance(60_000);
    expect(await keep("https://learn.acme.com", flaky.load)).toBe("acme 1");
    expect(await keep("https://learn.acme.com", flaky.load)).toBe("acme 3");
  });

  it("starts over rather than hold more keys than its limit", async () => {
    const keep = shortLived<string>({ ttlMs: 60_000, max: 2, now: clock().now });
    const first = counted(() => "first");
    await keep("a", first.load);
    await keep("b", async () => "b");
    await keep("c", async () => "c");
    await keep("a", first.load);
    expect(first.calls()).toBe(2);
  });
});
