// slack integration — satisfies the core Integration port; declares the config
// shape a Slack connection carries and the actions callers can invoke. The
// credential (bot token) is opaque to the domain; actions receive it revealed,
// at point of use, via the ActionContext.
//
// Assembly only — schemas live in schemas.ts, transport in client.ts, actions
// under actions/, and event formatting under notifications/.
import { zodConfig, zodSecrets, type Integration } from "../../core/integrations/index.js";
import { SlackConfig, SlackSecrets } from "./schemas.js";
import { postMessageToChannel } from "./actions/post-message-to-channel.js";
import { postEventNotification } from "./actions/post-event-notification.js";
import { listChannels } from "./actions/list-channels.js";

const slack: Integration = {
  id: "slack",
  ...zodConfig(SlackConfig),
  ...zodSecrets(SlackSecrets),
  actions: [postMessageToChannel, postEventNotification, listChannels],
};

export default slack;
