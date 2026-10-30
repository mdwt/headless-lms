import { describe, expect, it } from "vitest";
import { StorageAdapter } from "./index.js";

describe("StorageAdapter", () => {
  it("lists nothing, since nothing can be stored without a storage adapter", async () => {
    expect(await new StorageAdapter().list("org/o/uploads/")).toEqual([]);
  });

  it("fails loudly on every other use", async () => {
    await expect(new StorageAdapter().copy({ from: "a", to: "b" })).rejects.toThrow(
      "not implemented",
    );
  });
});
