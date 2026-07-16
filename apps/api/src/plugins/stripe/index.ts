// stripe integration — satisfies the core Integration port; declares
// the config shape a Stripe connection carries. The credential (secret key) is
// opaque to the domain and not validated here.
import { z } from "zod";
import { zodConfig, zodSecrets, type Integration } from "../../core/integrations/index.js";

const StripeSecrets = z.object({
  /** Stripe secret key (sk_live_… / sk_test_…). */
  apiKey: z.string().min(1),
});

const StripeConfig = z.object({
  /** Which Stripe environment this connection targets. */
  mode: z.enum(["live", "test"]).default("live"),
  /** Optional statement descriptor override for checkouts. */
  statementDescriptor: z.string().max(22).optional(),
});

// No actions: billing consumes this connection synchronously (checkout), not
// through invoked actions.
const stripe: Integration = {
  id: "stripe",
  ...zodConfig(StripeConfig),
  ...zodSecrets(StripeSecrets),
  actions: [],
};

export default stripe;
