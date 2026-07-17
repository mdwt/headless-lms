// slack integration — channel listing for pickers (select a channel to post to).
import { z } from "zod";
import { zodAction } from "@headless-lms/utils";
import { listChannels as fetchChannels } from "../client.js";

export const listChannels = zodAction({
  id: "listChannels",
  description:
    "List public Slack channels the connection can see (for channel pickers). Requires the channels:read scope.",
  input: z.object({
    cursor: z.string().optional().describe("Pagination cursor from a previous call."),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  output: z.object({
    channels: z.array(z.object({ id: z.string(), name: z.string() })),
    nextCursor: z.string().optional(),
  }),
  run(ctx, input) {
    return fetchChannels({ botToken: ctx.secrets.botToken as string }, input);
  },
});
