// slack integration — posts a formatted notification for a platform domain
// event. The event shape is the plugin's own contract (notifications/schema.ts);
// formatting is dispatched per event type (notifications/formatters.ts).
import { z } from "zod";
import { zodAction } from "../../../core/integrations/index.js";
import { postMessage } from "../client.js";
import { formatNotification } from "../notifications/formatters.js";
import { EventNotification } from "../notifications/schema.js";

export const postEventNotification = zodAction({
  id: "postEventNotification",
  description:
    "Post a formatted notification for a platform domain event (e.g. a student enrollment) to a Slack channel.",
  input: z.object({
    channel: z
      .string()
      .min(1)
      .optional()
      .describe("Falls back to the connection's configured defaultChannel."),
    event: EventNotification,
  }),
  output: z.object({
    channel: z.string(),
    ts: z.string().describe("Slack's message timestamp — its id within the channel."),
  }),
  run(ctx, input) {
    const channel = input.channel ?? (ctx.config.defaultChannel as string);
    const message = formatNotification(input.event);
    return postMessage(
      { botToken: ctx.secrets.botToken as string },
      { channel, text: message.text, blocks: message.blocks },
    );
  },
});
