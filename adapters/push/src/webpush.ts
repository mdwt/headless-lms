import webpush from "web-push";
import type { PushConfig, PushDevice, PushMessage } from "@headless-lms/core/types";
import {
  accepted,
  dead,
  failed,
  messageOf,
  retryableStatus,
  type Outcome,
  type ProviderSender,
} from "./outcome.js";

export class WebPushSender implements ProviderSender {
  constructor(
    private readonly config: NonNullable<PushConfig["webpush"]>,
    private readonly fetchFn: typeof fetch,
  ) {}

  async send(device: PushDevice, message: PushMessage): Promise<Outcome> {
    if (!device.p256dh || !device.auth) {
      return failed(false, "webpush device has no keys");
    }
    let request;
    try {
      request = webpush.generateRequestDetails(
        { endpoint: device.token, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(message),
        {
          vapidDetails: {
            subject: this.config.subject,
            publicKey: this.config.publicKey,
            privateKey: this.config.privateKey,
          },
        },
      );
    } catch (err) {
      return failed(false, `webpush: ${messageOf(err)}`);
    }
    const headers = Object.fromEntries(
      Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() !== "content-length")
        .map(([name, value]) => [name, String(value)]),
    );
    let response: Response;
    try {
      response = await this.fetchFn(request.endpoint, {
        method: "POST",
        headers,
        body: request.body ? new Uint8Array(request.body) : null,
      });
    } catch (err) {
      return failed(true, `webpush: ${messageOf(err)}`);
    }
    if (response.ok) {
      return accepted;
    }
    const error = `webpush ${response.status}`;
    if (response.status === 404 || response.status === 410) {
      return dead(error);
    }
    return failed(retryableStatus(response.status), error);
  }
}
