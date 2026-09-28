// slack integration — the posting action: takes a channel and a domain-event
// body, formats the message by event type, posts it.
import { z } from "zod";
import { zodAction } from "@headless-lms/core/integrations";
import { postMessage } from "../client.js";
import { formatMessage } from "../notifications/formatters.js";
import { EventBody } from "../notifications/schema.js";

export const postToChannel = zodAction({
  id: "postToChannel",
  description: "Post a message to a Slack channel.",
  input: z.object({
    channel: z
      .string()
      .min(1)
      .optional()
      .meta({
        description: "The channel to post to; the connection's default channel when omitted.",
        "x-options": { action: "listChannels", items: "channels", value: "id", label: "name" },
      }),
    body: EventBody,
  }),
  output: z.object({
    channel: z.string(),
    ts: z.string().describe("Slack's message timestamp."),
  }),
  run(ctx, input) {
    const channel = input.channel ?? (ctx.config.defaultChannel as string);
    const message = formatMessage(input.body);
    return postMessage(
      { botToken: ctx.secrets.botToken as string },
      { channel, text: message.text, blocks: message.blocks },
    );
  },
});
