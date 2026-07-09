# Integrations — Domain Spec

Integrations owns an org's connections to external services — Stripe, a CRM, a mail platform — so other parts of the system can act on them. A connection is an org's authenticated link to one external service: which service it is, the configuration that service needs, whether it's active, and a reference to its credentials. The domain owns the connection and its lifecycle; it does not call the external service, and it does not decide when an integration runs.

Every service authenticates differently — OAuth for one, an API key for another — so the domain doesn't fix a single auth shape. It holds a connection's credentials generically, whatever their form. Credentials are stored through the shared secure credential store: encrypted at rest, decrypted only at the point a caller uses them, and scoped to the owning org.

Two kinds of caller consume a connection. Billing reads an org's Stripe connection synchronously when it runs a checkout. Automations reads a connection when an automation action acts on an external service. In both cases the caller takes the connection and its credentials and constructs its own adapter to make the external call — integrations returns the connection, never a ready client, and never makes the call itself.

## Models

- **Connection** — an org's link to one external service: which service it is, its configuration (such as field mappings), whether it's active, and a reference to the credentials held in the secure credential store. A connection belongs to the org that owns it.

## Capabilities

- **Connect a service** — establish a connection for an org and store its credentials and configuration.
- **Reconnect** — refresh or re-authenticate a connection whose credentials have changed or expired.
- **Configure** — set or change a connection's configuration.
- **Disconnect** — remove a connection and its credentials.
- **Get a connection** — return an org's connection for a service, with access to its credentials, to the caller that acts on it.

## Boundaries

1. **integrations ↔ the adapters that call out** — the domain returns a connection and its credentials; the caller's adapter uses them to talk to the external service. The domain never makes the external call.
2. **integrations ↔ billing** — billing gets an org's payment connection to run a checkout synchronously. Integrations owns the connection; billing owns the checkout.
3. **integrations ↔ automations** — an automation action names a connection to act on; automations gets it from this domain and its adapter makes the call. Automations decides an integration runs; integrations owns the connection.
4. **integrations ↔ organizations** — a connection belongs to an org and is scoped to it; one org's connections and credentials are never visible to another.
5. **integrations ↔ secure credential store** — credentials are held in the shared secure store; the connection carries a reference, and callers resolve the credential at point of use.

## Events

- `connection.created` — a service is connected.
- `connection.updated` — a connection's credentials or configuration change.
- `connection.removed` — a connection is disconnected.
