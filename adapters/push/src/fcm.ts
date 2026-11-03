import type { KeyObject } from "node:crypto";
import type { PushConfig, PushDevice, PushMessage } from "@headless-lms/core/types";
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

export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const TOKEN_LIFETIME_S = 3600;
const EXPIRY_MARGIN_MS = 60_000;

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  key: KeyObject;
  tokenUri: string;
}

class TokenError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function field(account: Record<string, unknown>, name: string): string {
  const value = account[name];
  if (typeof value !== "string" || value === "") {
    throw new Error(`FCM service account is missing ${name}`);
  }
  return value;
}

function serviceAccount(account: Record<string, unknown>): ServiceAccount {
  return {
    projectId: field(account, "project_id"),
    clientEmail: field(account, "client_email"),
    key: privateKey(field(account, "private_key")),
    tokenUri: typeof account.token_uri === "string" ? account.token_uri : GOOGLE_TOKEN_URI,
  };
}

function fcmError(body: unknown): { status: string; errorCode: string } {
  const error =
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object"
      ? (body.error as { status?: unknown; details?: unknown })
      : {};
  const details = Array.isArray(error.details) ? error.details : [];
  const fcm = details.find(
    (detail): detail is { errorCode: string } =>
      typeof detail === "object" &&
      detail !== null &&
      typeof (detail as { errorCode?: unknown }).errorCode === "string",
  );
  return {
    status: typeof error.status === "string" ? error.status : "",
    errorCode: fcm?.errorCode ?? "",
  };
}

function data(message: PushMessage): Record<string, string> {
  const values: Record<string, string> = {
    notificationId: message.data.notificationId,
    type: message.data.type,
  };
  if (message.data.subject) {
    values.subject = JSON.stringify(message.data.subject);
  }
  if (message.data.parent) {
    values.parent = JSON.stringify(message.data.parent);
  }
  if (message.data.communityId) {
    values.communityId = message.data.communityId;
  }
  if (message.data.spaceId) {
    values.spaceId = message.data.spaceId;
  }
  return values;
}

export class FcmSender implements ProviderSender {
  private readonly account: ServiceAccount;
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(
    config: NonNullable<PushConfig["fcm"]>,
    private readonly fetchFn: typeof fetch,
    private readonly now: () => number,
  ) {
    this.account = serviceAccount(config.serviceAccount);
  }

  async send(device: PushDevice, message: PushMessage): Promise<Outcome> {
    let accessToken: string;
    try {
      accessToken = await this.accessToken();
    } catch (err) {
      return failed(
        err instanceof TokenError ? err.retryable : true,
        `fcm token: ${messageOf(err)}`,
      );
    }
    let response: Response;
    try {
      response = await this.fetchFn(
        `https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: message.title, body: message.body },
              data: data(message),
            },
          }),
        },
      );
    } catch (err) {
      return failed(true, `fcm: ${messageOf(err)}`);
    }
    if (response.ok) {
      return accepted;
    }
    const { status, errorCode } = fcmError(await response.json().catch(() => null));
    const code = errorCode || status;
    const error = `fcm ${response.status}${code ? ` ${code}` : ""}`;
    if (
      (response.status === 404 && (code === "UNREGISTERED" || code === "NOT_FOUND")) ||
      (response.status === 400 && code === "INVALID_ARGUMENT") ||
      (response.status === 403 && code === "SENDER_ID_MISMATCH")
    ) {
      return dead(error);
    }
    if (response.status === 401 && code !== "THIRD_PARTY_AUTH_ERROR") {
      this.token = null;
      return failed(true, error);
    }
    return failed(retryableStatus(response.status), error);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt - EXPIRY_MARGIN_MS) {
      return this.token.value;
    }
    this.pending ??= this.exchange().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async exchange(): Promise<string> {
    const issuedAt = Math.floor(this.now() / 1000);
    const assertion = signJwt(
      "RS256",
      { typ: "JWT" },
      {
        iss: this.account.clientEmail,
        scope: FCM_SCOPE,
        aud: this.account.tokenUri,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_S,
      },
      this.account.key,
    );
    const response = await this.fetchFn(this.account.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!response.ok) {
      throw new TokenError(
        `token endpoint responded ${response.status}`,
        retryableStatus(response.status),
      );
    }
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string") {
      throw new TokenError("token endpoint returned no access token", false);
    }
    const lifetime = typeof body.expires_in === "number" ? body.expires_in : TOKEN_LIFETIME_S;
    this.token = { value: body.access_token, expiresAt: this.now() + lifetime * 1000 };
    return body.access_token;
  }
}
