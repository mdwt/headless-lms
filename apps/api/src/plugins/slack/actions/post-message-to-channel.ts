// slack integration — generic text posting action.
import { z } from "zod";
import { zodAction } from "../../../core/integrations/index.js";
import { postMessage } from "../client.js";

export const postMessageToChannel = zodAction({
  id: "postMessageToChannel",
  description: "Post a message to a Slack channel (defaults to the connection's configured channel).",
  input: z.object({
    channel: z
      .string()
      .min(1)
      .optional()
      .describe("Falls back to the connection's configured defaultChannel."),
    text: z.string().min(1),
  }),
  output: z.object({
    channel: z.string(),
    ts: z.string().describe("Slack's message timestamp — its id within the channel."),
  }),
  run(ctx, input) {
    const channel = input.channel ?? (ctx.config.defaultChannel as string);
    return postMessage({ botToken: ctx.secrets.botToken as string }, { channel, text: input.text });
  },
});
