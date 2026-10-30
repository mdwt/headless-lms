import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { Client, CopyDestinationOptions } from "minio";
import { MinioStorageAdapter } from "./index.js";

function adapter() {
  return new MinioStorageAdapter({
    endPoint: "localhost",
    port: 9000,
    useSSL: false,
    accessKey: "key",
    secretKey: "secret",
    region: "us-east-1",
    bucket: "lms",
    uploadExpirySeconds: 600,
    downloadExpirySeconds: 300,
  });
}

describe("MinioStorageAdapter", () => {
  it("exposes the upload ticket lifetime", () => {
    expect(adapter().uploadExpirySeconds).toBe(600);
  });

  it("lists every object under a prefix", async () => {
    vi.spyOn(Client.prototype, "bucketExists").mockResolvedValue(true);
    const list = vi.spyOn(Client.prototype, "listObjectsV2").mockReturnValue(
      Readable.from([
        {
          name: "org/o/uploads/a/x.png",
          size: 3,
          etag: "e",
          lastModified: new Date("2026-10-22T10:00:00Z"),
        },
        { prefix: "org/o/uploads/b/", size: 0 },
      ]) as never,
    );

    expect(await adapter().list("org/o/uploads/")).toEqual([
      { key: "org/o/uploads/a/x.png", size: 3, lastModified: "2026-10-22T10:00:00.000Z" },
    ]);
    expect(list).toHaveBeenCalledWith("lms", "org/o/uploads/", true);
    vi.restoreAllMocks();
  });

  it("copies an object with its stored metadata", async () => {
    vi.spyOn(Client.prototype, "bucketExists").mockResolvedValue(true);
    const copy = vi.spyOn(Client.prototype, "copyObject").mockResolvedValue({} as never);
    await adapter().copy({ from: "org/o/uploads/a/x.png", to: "org/o/image/a/k/x.png" });
    const destination = copy.mock.calls[0]?.[1] as CopyDestinationOptions;
    expect(destination.getHeaders()).toEqual({});
    vi.restoreAllMocks();
  });
});
