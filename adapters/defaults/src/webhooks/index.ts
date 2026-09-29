import type { WebhookRequest, WebhookResponse, WebhookSender } from "@headless-lms/core/types";

const DEFAULT_TIMEOUT_MS = 10_000;

export class FetchWebhookSender implements WebhookSender {
  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async send(request: WebhookRequest): Promise<WebhookResponse> {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    await response.body?.cancel();
    return { status: response.status };
  }
}
