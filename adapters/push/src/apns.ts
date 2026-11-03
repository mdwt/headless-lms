import type { KeyObject } from "node:crypto";
import type { PushConfig, PushDevice, PushMessage } from "@headless-lms/core/types";
import type { Http2Transport } from "./http2.js";
import { privateKey, signJwt } from "./jwt.js";
import {
  accepted,
  dead,
  failed,
  messageOf,
  retryableStatus,
  type Outcome,
  type ProviderSender,
} from "./outcome.js";

export const APNS_PRODUCTION = "https://api.push.apple.com";
export const APNS_SANDBOX = "https://api.sandbox.push.apple.com";
export const APNS_TOKEN_TTL_MS = 50 * 60 * 1000;

const DEAD_REASONS = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);

function reasonOf(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "reason" in parsed) {
      return String(parsed.reason);
    }
  } catch {
    return "";
  }
  return "";
}

export class ApnsSender implements ProviderSender {
  private readonly key: KeyObject;
  private token: { value: string; issuedAt: number } | null = null;

  constructor(
    private readonly config: NonNullable<PushConfig["apns"]>,
    private readonly transport: Http2Transport,
    private readonly now: () => number,
  ) {
    this.key = privateKey(config.key);
  }

  async send(device: PushDevice, message: PushMessage): Promise<Outcome> {
    if (!device.appId) {
      return failed(false, "apns device has no app id");
    }
    const origin = device.environment === "sandbox" ? APNS_SANDBOX : APNS_PRODUCTION;
    const body = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body } },
      data: message.data,
    });
    let response;
    try {
      response = await this.transport(
        origin,
        `/3/device/${device.token}`,
        {
          authorization: `bearer ${this.providerToken()}`,
          "apns-topic": device.appId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body,
      );
    } catch (err) {
      return failed(true, `apns: ${messageOf(err)}`);
    }
    if (response.status === 200) {
      return accepted;
    }
    const reason = reasonOf(response.body);
    const error = `apns ${response.status}${reason ? ` ${reason}` : ""}`;
    if (response.status === 410 || (response.status === 400 && DEAD_REASONS.has(reason))) {
      return dead(error);
    }
    if (response.status === 403 && reason === "ExpiredProviderToken") {
      this.token = null;
      return failed(true, error);
    }
    if (response.status === 403 && reason === "InvalidProviderToken") {
      this.token = null;
    }
    return failed(retryableStatus(response.status), error);
  }

  private providerToken(): string {
    const now = this.now();
    if (this.token && now - this.token.issuedAt < APNS_TOKEN_TTL_MS) {
      return this.token.value;
    }
    const value = signJwt(
      "ES256",
      { kid: this.config.keyId },
      { iss: this.config.teamId, iat: Math.floor(now / 1000) },
      this.key,
    );
    this.token = { value, issuedAt: now };
    return value;
  }
}
