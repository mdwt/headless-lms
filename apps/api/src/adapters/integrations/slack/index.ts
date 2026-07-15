// slack integration (adapter) — satisfies the core Integration port; declares
// the config shape a Slack connection carries. The credential (bot token) is
// opaque to the domain and not validated here.
import { z } from "zod";
import type { Integration } from "../../../core/integrations/ports.js";
import { zodConfigValidator } from "../validation.js";

const SlackConfig = z.object({
  /** Channel to post to when an action doesn't name one (e.g. "#general"). */
  defaultChannel: z.string().min(1),
});

export const slack: Integration = {
  id: "slack",
  validateConfig: zodConfigValidator(SlackConfig),
};
