import type {
  DeliveryResult,
  Logger,
  PushConfig,
  PushDevice,
  PushMessage,
  PushProvider,
} from "@headless-lms/core/types";
import type { PushSender } from "@headless-lms/core/shared/ports";
import { ApnsSender } from "./apns.js";
import { FcmSender } from "./fcm.js";
import { http2Transport, type Http2Transport } from "./http2.js";
import { failed, messageOf, type Outcome, type ProviderSender } from "./outcome.js";
import { WebPushSender } from "./webpush.js";

export type { Http2Response, Http2Transport } from "./http2.js";
export { APNS_PRODUCTION, APNS_SANDBOX, APNS_TOKEN_TTL_MS } from "./apns.js";
export { FCM_SCOPE, GOOGLE_TOKEN_URI } from "./fcm.js";

export interface PushAdapterOptions {
  logger?: Logger;
  fetch?: typeof fetch;
  http2?: Http2Transport;
  now?: () => number;
}

export class PushAdapter implements PushSender {
  private readonly senders: Partial<Record<PushProvider, ProviderSender>> = {};
  private readonly logger?: Logger;

  constructor(config: PushConfig, options: PushAdapterOptions = {}) {
    const fetchFn = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    this.logger = options.logger;
    if (config.apns) {
      this.senders.apns = new ApnsSender(config.apns, options.http2 ?? http2Transport(), now);
    }
    if (config.fcm) {
      this.senders.fcm = new FcmSender(config.fcm, fetchFn, now);
    }
    if (config.webpush) {
      this.senders.webpush = new WebPushSender(config.webpush, fetchFn);
    }
  }

  async send(devices: PushDevice[], message: PushMessage): Promise<DeliveryResult> {
    const outcomes = await Promise.all(devices.map((device) => this.sendOne(device, message)));
    const deadDeviceIds: string[] = [];
    const errors: string[] = [];
    let anyAccepted = false;
    let anyRetryable = false;
    outcomes.forEach((outcome, index) => {
      const device = devices[index]!;
      if (outcome.kind === "accepted") {
        anyAccepted = true;
        return;
      }
      errors.push(`${device.id}: ${outcome.error}`);
      if (outcome.kind === "dead") {
        deadDeviceIds.push(device.id);
      } else if (outcome.retryable) {
        anyRetryable = true;
      }
      this.logger?.warn("push to a device failed", {
        deviceId: device.id,
        provider: device.provider,
        notificationId: message.data.notificationId,
        outcome: outcome.kind,
        error: outcome.error,
      });
    });
    if (!anyAccepted && anyRetryable) {
      throw new Error(`push accepted by no device: ${errors.join("; ")}`);
    }
    if (anyAccepted) {
      return { accepted: true, deadDeviceIds };
    }
    return {
      accepted: false,
      deadDeviceIds,
      error:
        errors.length > 0
          ? `push accepted by no device: ${errors.join("; ")}`
          : "no device to send to",
    };
  }

  private async sendOne(device: PushDevice, message: PushMessage): Promise<Outcome> {
    const sender = this.senders[device.provider];
    if (!sender) {
      return failed(false, `push through ${device.provider} is not configured`);
    }
    try {
      return await sender.send(device, message);
    } catch (err) {
      return failed(false, `${device.provider}: ${messageOf(err)}`);
    }
  }
}
