import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPublicIp } from "@headless-lms/core/shared/network";
import type { WebhookRequest, WebhookResponse, WebhookSender } from "@headless-lms/core/types";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchWebhookSenderOptions {
  timeoutMs?: number;
  /** Deliver to loopback and private network addresses too. Local development and testing only. */
  allowPrivateNetwork?: boolean;
}

interface ResolvedAddress {
  address: string;
  family: number;
}

export class WebhookAddressRefusedError extends Error {
  constructor(
    readonly host: string,
    readonly address: string,
  ) {
    super(`webhook host "${host}" resolves to ${address}, which is not a public address`);
    this.name = "WebhookAddressRefusedError";
  }
}

/** POSTs each delivery to the address its host resolved to once, so DNS can't swap it after the check. */
export class FetchWebhookSender implements WebhookSender {
  private readonly timeoutMs: number;
  private readonly allowPrivateNetwork: boolean;

  constructor(options: FetchWebhookSenderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.allowPrivateNetwork = options.allowPrivateNetwork ?? false;
  }

  async send(request: WebhookRequest): Promise<WebhookResponse> {
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`webhook URL protocol "${url.protocol}" is not supported`);
    }
    const signal = AbortSignal.timeout(this.timeoutMs);
    const addresses = await this.resolve(url.hostname.replace(/^\[(.*)\]$/, "$1"));
    signal.throwIfAborted();
    return post(url, request, addresses, signal);
  }

  private async resolve(host: string): Promise<ResolvedAddress[]> {
    const family = isIP(host);
    const addresses =
      family === 0
        ? await lookup(host, { all: true, verbatim: true })
        : [{ address: host, family }];
    if (addresses.length === 0) {
      throw new Error(`webhook host "${host}" did not resolve`);
    }
    if (!this.allowPrivateNetwork) {
      const refused = addresses.find(({ address }) => !isPublicIp(address));
      if (refused) {
        throw new WebhookAddressRefusedError(host, refused.address);
      }
    }
    return addresses;
  }
}

function post(
  url: URL,
  request: WebhookRequest,
  addresses: ResolvedAddress[],
  signal: AbortSignal,
): Promise<WebhookResponse> {
  const pinned: LookupFunction = (_hostname, options, callback) => {
    const [first] = addresses;
    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, first!.address, first!.family);
    }
  };
  const options: RequestOptions = {
    method: "POST",
    headers: { ...request.headers, "content-length": Buffer.byteLength(request.body) },
    lookup: pinned,
    signal,
  };
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(url, options, (res) => {
      resolve({ status: res.statusCode ?? 0 });
      res.destroy();
    });
    req.on("error", reject);
    req.end(request.body);
  });
}
