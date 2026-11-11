import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PUBLIC_CACHE_CONTROL } from "@headless-lms/core/types";
import { S3StorageAdapter } from "./index.js";

function adapter() {
  return new S3StorageAdapter({
    region: "us-east-1",
    bucket: "lms",
    accessKeyId: "key",
    secretAccessKey: "secret",
    uploadExpirySeconds: 600,
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

  it("publishes a copy with the source content type and an immutable cache header", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation(async () => ({ ContentType: "image/png" }) as never);
    await adapter().publish({ from: "org/o/image/a/x.png", to: "public/o/crs_1/a" });
    const command = send.mock.calls[1]?.[0] as CopyObjectCommand;
    expect(command.input).toEqual({
      Bucket: "lms",
      Key: "public/o/crs_1/a",
      CopySource: "lms/org/o/image/a/x.png",
      MetadataDirective: "REPLACE",
      CacheControl: "public, max-age=31536000, immutable",
      ContentType: "image/png",
    });
    send.mockRestore();
  });

  it("builds public URLs from the configured origin, and refuses without one", () => {
    expect(() => adapter().publicUrl("public/o/crs_1/a")).toThrow(/publicBaseUrl/);
    const cdn = new S3StorageAdapter({
      region: "us-east-1",
      bucket: "lms",
      publicBaseUrl: "https://cdn.example.com",
      uploadExpirySeconds: 600,
    });
    expect(cdn.publicUrl("public/o/crs_1/a")).toBe("https://cdn.example.com/public/o/crs_1/a");
    expect(cloudFront().publicUrl("public/o/crs_1/a")).toBe(
      "https://media.example.com/public/o/crs_1/a",
    );
  });

  it("presigns the same S3 link all through a window, cacheable and named when asked", async () => {
    const link = await adapter().presignDownload({ key: "org/o/document/a/guide.pdf", ...WINDOW });
    expect(await adapter().presignDownload({ key: "org/o/document/a/guide.pdf", ...WINDOW })).toBe(
      link,
    );
    const url = new URL(link);
    expect(url.pathname).toBe("/org/o/document/a/guide.pdf");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261111T060000Z");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("43200");
    expect(url.searchParams.get("response-cache-control")).toBe(PUBLIC_CACHE_CONTROL);
    expect(url.searchParams.has("response-content-disposition")).toBe(false);
    const named = new URL(
      await adapter().presignDownload({
        key: "org/o/document/a/guide.pdf",
        downloadFilename: 'Work"book.pdf',
        ...WINDOW,
      }),
    );
    expect(named.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="Workbook.pdf"',
    );
  });

  it("signs a CloudFront link with a canned policy that ends when the window does", async () => {
    const link = await cloudFront().presignDownload({
      key: "org/o/video/a/lesson one.mp4",
      downloadFilename: "Lesson.mp4",
      ...WINDOW,
    });
    expect(
      await cloudFront().presignDownload({
        key: "org/o/video/a/lesson one.mp4",
        downloadFilename: "Lesson.mp4",
        ...WINDOW,
      }),
    ).toBe(link);
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe(
      "https://media.example.com/org/o/video/a/lesson%20one.mp4",
    );
    expect(url.searchParams.get("response-cache-control")).toBe(PUBLIC_CACHE_CONTROL);
    expect(url.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="Lesson.mp4"',
    );
    const expires = Math.floor(WINDOW.expiresAt.getTime() / 1000);
    expect(url.searchParams.get("Expires")).toBe(String(expires));
    expect(url.searchParams.get("Key-Pair-Id")).toBe("K2JCJMDEHXQW5F");
    const resource = link.slice(0, link.indexOf("&Expires="));
    const policy = JSON.stringify({
      Statement: [
        { Resource: resource, Condition: { DateLessThan: { "AWS:EpochTime": expires } } },
      ],
    });
    const signature = Buffer.from(
      url.searchParams.get("Signature")!.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/"),
      "base64",
    );
    expect(verify("RSA-SHA1", Buffer.from(policy), KEYS.publicKey, signature)).toBe(true);
  });
});

const WINDOW = {
  signedAt: new Date("2026-11-11T06:00:00Z"),
  expiresAt: new Date("2026-11-11T18:00:00Z"),
};

const KEYS = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function cloudFront() {
  return new S3StorageAdapter({
    region: "us-east-1",
    bucket: "lms",
    accessKeyId: "key",
    secretAccessKey: "secret",
    cloudFront: {
      url: "https://media.example.com/",
      keyPairId: "K2JCJMDEHXQW5F",
      privateKey: KEYS.privateKey,
    },
    uploadExpirySeconds: 600,
  });
}
