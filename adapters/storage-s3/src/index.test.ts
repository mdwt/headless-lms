import { describe, expect, it, vi } from "vitest";
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { S3StorageAdapter } from "./index.js";

function adapter() {
  return new S3StorageAdapter({
    region: "us-east-1",
    bucket: "lms",
    accessKeyId: "key",
    secretAccessKey: "secret",
    uploadExpirySeconds: 600,
    downloadExpirySeconds: 300,
  });
}

describe("S3StorageAdapter", () => {
  it("exposes the upload ticket lifetime", () => {
    expect(adapter().uploadExpirySeconds).toBe(600);
  });

  it("lists every object under a prefix across pages", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command) => {
      const input = (command as ListObjectsV2Command).input;
      if (!input.ContinuationToken) {
        return {
          Contents: [
            {
              Key: "org/o/uploads/a/x.png",
              Size: 3,
              LastModified: new Date("2026-10-22T10:00:00Z"),
            },
          ],
          IsTruncated: true,
          NextContinuationToken: "next",
        };
      }
      return { Contents: [{ Key: "org/o/uploads/b/y.png", Size: 4 }], IsTruncated: false };
    });

    expect(await adapter().list("org/o/uploads/")).toEqual([
      { key: "org/o/uploads/a/x.png", size: 3, lastModified: "2026-10-22T10:00:00.000Z" },
      { key: "org/o/uploads/b/y.png", size: 4 },
    ]);
    const inputs = send.mock.calls.map(([c]) => (c as ListObjectsV2Command).input);
    expect(inputs).toEqual([
      { Bucket: "lms", Prefix: "org/o/uploads/" },
      { Bucket: "lms", Prefix: "org/o/uploads/", ContinuationToken: "next" },
    ]);
    send.mockRestore();
  });

  it("copies an object with its stored metadata", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    await adapter().copy({ from: "org/o/uploads/a/x.png", to: "org/o/image/a/k/x.png" });
    const command = send.mock.calls[0]?.[0] as CopyObjectCommand;
    expect(command.input).toEqual({
      Bucket: "lms",
      Key: "org/o/image/a/k/x.png",
      CopySource: "lms/org/o/uploads/a/x.png",
    });
    send.mockRestore();
  });
});
