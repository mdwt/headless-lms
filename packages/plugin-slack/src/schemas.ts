// slack integration — connection secrets/config schemas. Descriptions flow
// into the JSON Schema the admin UI renders, so they double as setup docs.
import { z } from "zod";

export const SlackSecrets = z.object({
  botToken: z
    .string()
    .min(1)
    .describe(
      "Slack bot token (xoxb-…). Create a Slack app at api.slack.com/apps → " +
        "OAuth & Permissions → add the bot scopes chat:write (post messages) and " +
        "channels:read (list channels) → Install to Workspace → copy the Bot User OAuth Token.",
    ),
});

export const SlackConfig = z.object({
  defaultChannel: z
    .string()
    .min(1)
    .describe(
      'Channel to post to when an action doesn\'t name one (e.g. "#general"). ' +
        "The bot must be a member of the channel — invite it with /invite.",
    ),
});
