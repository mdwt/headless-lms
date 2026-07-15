// stripe integration (adapter) — satisfies the core Integration port; declares
// the config shape a Stripe connection carries. The credential (secret key) is
// opaque to the domain and not validated here.
import { z } from "zod";
import type { Integration } from "../../../core/integrations/ports.js";
import { zodConfigValidator } from "../validation.js";

const StripeConfig = z.object({
  /** Which Stripe environment this connection targets. */
  mode: z.enum(["live", "test"]).default("live"),
  /** Optional statement descriptor override for checkouts. */
  statementDescriptor: z.string().max(22).optional(),
});

export const stripe: Integration = {
  id: "stripe",
  validateConfig: zodConfigValidator(StripeConfig),
};
