// slack integration — satisfies the Integration contract; declares the config
// shape a Slack connection carries and the actions callers can invoke. The
// credential (bot token) is opaque to the platform; actions receive it
// revealed, at point of use, via the ActionContext.
//
// Assembly only — schemas live in schemas.ts, transport in client.ts, actions
// under actions/, and event formatting under notifications/.
import type { Integration } from "@headless-lms/types";
import { zodConfig, zodSecrets } from "@headless-lms/utils";
import { SlackConfig, SlackSecrets } from "./schemas.js";
import { postToChannel } from "./actions/post-to-channel.js";
import { listChannels } from "./actions/list-channels.js";

const slack: Integration = {
  id: "slack",
  ...zodConfig(SlackConfig),
  ...zodSecrets(SlackSecrets),
  actions: [postToChannel, listChannels],
};

export default slack;
