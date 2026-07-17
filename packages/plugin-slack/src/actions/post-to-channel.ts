// slack integration — the posting action: takes a channel and a domain-event
// body, formats the message by event type, posts it.
import { z } from "zod";
import { zodAction } from "@headless-lms/integration-sdk";
import { postMessage } from "../client.js";
import { formatMessage } from "../notifications/formatters.js";
import { EventBody } from "../notifications/schema.js";

export const postToChannel = zodAction({
  id: "postToChannel",
  description:
    "Post a domain event (e.g. a student enrollment) to a Slack channel, formatted by event type.",
  input: z.object({
    channel: z
      .string()
      .min(1)
      .optional()
      .describe("Falls back to the connection's configured defaultChannel."),
    body: EventBody,
  }),
  output: z.object({
    channel: z.string(),
    ts: z.string().describe("Slack's message timestamp — its id within the channel."),
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
