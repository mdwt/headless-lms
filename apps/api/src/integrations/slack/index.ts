// slack integration — satisfies the core Integration port; declares
// the config shape a Slack connection carries and the actions callers can
// invoke. The credential (bot token) is opaque to the domain; actions receive
// it revealed, at point of use, via the ActionContext.
import { z } from "zod";
import { zodConfig, zodAction, type Integration } from "../../core/integrations/index.js";

const SlackConfig = z.object({
  /** Channel to post to when an action doesn't name one (e.g. "#general"). */
  defaultChannel: z.string().min(1),
});

const postMessageToChannel = zodAction({
  id: "postMessageToChannel",
  input: z.object({
    /** Falls back to the connection's configured defaultChannel. */
    channel: z.string().min(1).optional(),
    text: z.string().min(1),
  }),
  output: z.object({
    channel: z.string(),
    /** Slack's message timestamp — its id within the channel. */
    ts: z.string(),
  }),
  async run(ctx, input) {
    const channel = input.channel ?? (ctx.config.defaultChannel as string);
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${ctx.secrets.botToken as string}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text: input.text }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string; ts?: string };
    if (!res.ok || !body.ok) {
      throw new Error(`slack chat.postMessage failed: ${body.error ?? res.status}`);
    }
    return { channel, ts: body.ts ?? "" };
  },
});

const slack: Integration = {
  id: "slack",
  ...zodConfig(SlackConfig),
  actions: [postMessageToChannel],
};

export default slack;
