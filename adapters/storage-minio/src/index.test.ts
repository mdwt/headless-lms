import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { Client, CopyDestinationOptions } from "minio";
import { PUBLIC_CACHE_CONTROL } from "@headless-lms/core/types";
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
  });
}

describe("MinioStorageAdapter", () => {
  it("exposes the upload ticket lifetime", () => {
    expect(adapter().uploadExpirySeconds).toBe(600);
  });

  it("lists every object under a prefix", async () => {
    vi.spyOn(Client.prototype, "bucketExists").mockResolvedValue(true);
    vi.spyOn(Client.prototype, "setBucketPolicy").mockResolvedValue();
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
    vi.spyOn(Client.prototype, "setBucketPolicy").mockResolvedValue();
    const copy = vi.spyOn(Client.prototype, "copyObject").mockResolvedValue({} as never);
    await adapter().copy({ from: "org/o/uploads/a/x.png", to: "org/o/image/a/k/x.png" });
    const destination = copy.mock.calls[0]?.[1] as CopyDestinationOptions;
    expect(destination.getHeaders()).toEqual({});
    vi.restoreAllMocks();
  });

  it("lets anyone read the public/ prefix and nothing else", async () => {
    vi.spyOn(Client.prototype, "bucketExists").mockResolvedValue(true);
    const policy = vi.spyOn(Client.prototype, "setBucketPolicy").mockResolvedValue();
    await adapter().ensureBucket();
    const [bucket, json] = policy.mock.calls[0]!;
    expect(bucket).toBe("lms");
    expect(JSON.parse(json as string).Statement).toEqual([
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: ["arn:aws:s3:::lms/public/*"],
      },
    ]);
    vi.restoreAllMocks();
  });

  it("publishes a copy with the source content type and an immutable cache header", async () => {
    vi.spyOn(Client.prototype, "bucketExists").mockResolvedValue(true);
    vi.spyOn(Client.prototype, "setBucketPolicy").mockResolvedValue();
    vi.spyOn(Client.prototype, "statObject").mockResolvedValue({
      size: 3,
      etag: "e",
      lastModified: new Date(),
      metaData: { "content-type": "image/png" },
    } as never);
    const copy = vi.spyOn(Client.prototype, "copyObject").mockResolvedValue({} as never);
    await adapter().publish({ from: "org/o/image/a/x.png", to: "public/o/crs_1/a" });
    const destination = copy.mock.calls[0]?.[1] as CopyDestinationOptions;
    expect(destination.Object).toBe("public/o/crs_1/a");
    expect(destination.getHeaders()).toEqual({
      "X-Amz-Metadata-Directive": "REPLACE",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
    });
    vi.restoreAllMocks();
  });

  it("builds public URLs from the bucket origin, or the configured one", () => {
    expect(adapter().publicUrl("public/o/crs_1/a")).toBe(
      "http://localhost:9000/lms/public/o/crs_1/a",
    );
    const cdn = new MinioStorageAdapter({
      endPoint: "localhost",
      port: 9000,
      useSSL: false,
      accessKey: "key",
      secretKey: "secret",
      region: "us-east-1",
      bucket: "lms",
      publicUrl: "https://cdn.example.com/",
      uploadExpirySeconds: 600,
    });
    expect(cdn.publicUrl("public/o/crs_1/a")).toBe("https://cdn.example.com/public/o/crs_1/a");
  });

  it("presigns a link for the given lifetime, cacheable and named when asked", async () => {
    vi.spyOn(Client.prototype, "bucketExists").mockResolvedValue(true);
    vi.spyOn(Client.prototype, "setBucketPolicy").mockResolvedValue();
    const link = await adapter().presignDownload({
      key: "org/o/document/a/guide.pdf",
      expiresInSeconds: 21600,
    });
    const url = new URL(link);
    expect(url.pathname).toBe("/lms/org/o/document/a/guide.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("21600");
    expect(url.searchParams.get("response-cache-control")).toBe(PUBLIC_CACHE_CONTROL);
    const named = new URL(
      await adapter().presignDownload({
        key: "org/o/document/a/guide.pdf",
        downloadFilename: "Workbook.pdf",
        expiresInSeconds: 21600,
      }),
    );
    expect(named.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="Workbook.pdf"',
    );
  });
});
