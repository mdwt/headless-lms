import { afterEach, describe, expect, it } from "vitest";

import {
  loadPlatformConfig,
  loadPushConfig,
  parseList,
  parseMemberImageMaxBytes,
} from "./config.js";

const original = process.env.MEMBER_IMAGE_MAX_BYTES;
const PUSH_VARS = [
  "APNS_TEAM_ID",
  "APNS_KEY_ID",
  "APNS_KEY",
  "APNS_BUNDLE_IDS",
  "FCM_SERVICE_ACCOUNT",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "PLATFORM_KEY",
  "PLATFORM_ACCOUNT_EMAIL",
  "PLATFORM_ACCOUNT_NAME",
  "AUTH_TRUSTED_PROXIES",
];
const originalPush = Object.fromEntries(PUSH_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of PUSH_VARS) {
    if (originalPush[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalPush[name];
    }
  }
  if (original === undefined) {
    delete process.env.MEMBER_IMAGE_MAX_BYTES;
  } else {
    process.env.MEMBER_IMAGE_MAX_BYTES = original;
  }
});

describe("parseMemberImageMaxBytes", () => {
  it("defaults to 10 MiB when unset", () => {
    delete process.env.MEMBER_IMAGE_MAX_BYTES;
    expect(parseMemberImageMaxBytes()).toBe(10 * 1024 * 1024);
  });

  it("reads a positive integer", () => {
    process.env.MEMBER_IMAGE_MAX_BYTES = "2097152";
    expect(parseMemberImageMaxBytes()).toBe(2097152);
  });

  it("refuses a value that would disable or break the cap", () => {
    for (const raw of ["10MB", "0", "-1", "1.5"]) {
      process.env.MEMBER_IMAGE_MAX_BYTES = raw;
      expect(() => parseMemberImageMaxBytes()).toThrow("invalid MEMBER_IMAGE_MAX_BYTES");
    }
  });
});

describe("loadPushConfig", () => {
  it("configures no provider when no push variable is set", () => {
    for (const name of PUSH_VARS) {
      delete process.env[name];
    }
    expect(loadPushConfig()).toEqual({});
  });

  it("reads each provider whose variables are all set", () => {
    for (const name of PUSH_VARS) {
      delete process.env[name];
    }
    process.env.APNS_TEAM_ID = "TEAM";
    process.env.APNS_KEY_ID = "KEY";
    process.env.APNS_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
    process.env.APNS_BUNDLE_IDS = "com.a.app, com.b.app";
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
    expect(loadPushConfig()).toEqual({
      apns: {
        teamId: "TEAM",
        keyId: "KEY",
        key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        bundleIds: ["com.a.app", "com.b.app"],
      },
      webpush: { publicKey: "pub", privateKey: "priv", subject: "mailto:ops@example.com" },
    });
  });

  it("refuses a provider with some of its variables missing, or a service account that is not JSON", () => {
    for (const name of PUSH_VARS) {
      delete process.env[name];
    }
    process.env.VAPID_PUBLIC_KEY = "pub";
    expect(() => loadPushConfig()).toThrow(
      "incomplete Web Push push configuration: set VAPID_PRIVATE_KEY, VAPID_SUBJECT",
    );
    delete process.env.VAPID_PUBLIC_KEY;
    process.env.FCM_SERVICE_ACCOUNT = "not json";
    expect(() => loadPushConfig()).toThrow("invalid FCM_SERVICE_ACCOUNT");
    process.env.FCM_SERVICE_ACCOUNT = '{"project_id":"p"}';
    expect(loadPushConfig()).toEqual({ fcm: { serviceAccount: { project_id: "p" } } });
  });
});

describe("loadPlatformConfig", () => {
  it("is off without PLATFORM_KEY", () => {
    delete process.env.PLATFORM_KEY;
    process.env.PLATFORM_ACCOUNT_EMAIL = "platform@example.test";
    expect(loadPlatformConfig()).toBeUndefined();
  });

  it("reads the key and the account", () => {
    process.env.PLATFORM_KEY = "k".repeat(40);
    process.env.PLATFORM_ACCOUNT_EMAIL = "platform@example.test";
    process.env.PLATFORM_ACCOUNT_NAME = "Shop";
    expect(loadPlatformConfig()).toEqual({
      key: "k".repeat(40),
      accountEmail: "platform@example.test",
      accountName: "Shop",
    });
  });

  it("refuses a key without an account email", () => {
    process.env.PLATFORM_KEY = "k".repeat(40);
    delete process.env.PLATFORM_ACCOUNT_EMAIL;
    expect(() => loadPlatformConfig()).toThrow(/PLATFORM_ACCOUNT_EMAIL/);
  });
});

describe("parseList", () => {
  it("is undefined when the variable is unset or empty", () => {
    delete process.env.AUTH_TRUSTED_PROXIES;
    expect(parseList("AUTH_TRUSTED_PROXIES")).toBeUndefined();
    process.env.AUTH_TRUSTED_PROXIES = " , ";
    expect(parseList("AUTH_TRUSTED_PROXIES")).toBeUndefined();
  });

  it("splits on commas and trims", () => {
    process.env.AUTH_TRUSTED_PROXIES = "10.0.0.0/16, 192.0.2.10";
    expect(parseList("AUTH_TRUSTED_PROXIES")).toEqual(["10.0.0.0/16", "192.0.2.10"]);
  });
});
