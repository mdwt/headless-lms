// slack integration — thin Slack Web API wrapper shared by all actions.
// Owns transport concerns only (auth header, envelope parsing, error surfacing);
// what to send lives with the actions/formatters.

export interface SlackClientCtx {
  botToken: string;
}

interface SlackEnvelope {
  ok: boolean;
  error?: string;
}

async function slackApi<T extends SlackEnvelope>(
  ctx: SlackClientCtx,
  method: string,
  init: RequestInit,
  query?: URLSearchParams,
): Promise<T> {
  const url = `https://slack.com/api/${method}${query ? `?${query.toString()}` : ""}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${ctx.botToken}`,
      ...init.headers,
    },
  });
  const body = (await res.json()) as T;
  if (!res.ok || !body.ok) {
    throw new Error(`slack ${method} failed: ${body.error ?? res.status}`);
  }
  return body;
}

export async function postMessage(
  ctx: SlackClientCtx,
  args: { channel: string; text: string; blocks?: unknown[] },
): Promise<{ channel: string; ts: string }> {
  const body = await slackApi<SlackEnvelope & { ts?: string }>(ctx, "chat.postMessage", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: args.channel, text: args.text, blocks: args.blocks }),
  });
  return { channel: args.channel, ts: body.ts ?? "" };
}

export interface SlackChannel {
  id: string;
  name: string;
}

export async function listChannels(
  ctx: SlackClientCtx,
  args: { cursor?: string; limit?: number },
): Promise<{ channels: SlackChannel[]; nextCursor?: string }> {
  // conversations.list does not accept a JSON body — arguments go in the query.
  const query = new URLSearchParams({
    types: "public_channel",
    exclude_archived: "true",
    limit: String(args.limit ?? 100),
  });
  if (args.cursor) {
    query.set("cursor", args.cursor);
  }
  const body = await slackApi<
    SlackEnvelope & {
      channels?: Array<{ id: string; name: string }>;
      response_metadata?: { next_cursor?: string };
    }
  >(ctx, "conversations.list", { method: "GET" }, query);
  const nextCursor = body.response_metadata?.next_cursor;
  return {
    channels: (body.channels ?? []).map(({ id, name }) => ({ id, name })),
    ...(nextCursor ? { nextCursor } : {}),
  };
}
