# @headless-lms/adapter-pubsub-postgres

Postgres `LISTEN/NOTIFY` implementation of the `PubSub` port from
`@headless-lms/core/shared/ports`. A message published on any API instance is delivered
to every subscriber of its channel on every instance, the publisher's included. Live
chat runs on it: the forwarder publishes each chat change, and every instance's chat
hub pushes it to the streams connected to that instance. Every deployment runs it, a
single instance included.

Delivery is best effort and unordered. A subscriber misses what is published while its
instance is disconnected, and its `onReset` fires after every reconnect so it can tell
its clients to reload.

```ts
import { PostgresPubSub } from "@headless-lms/adapter-pubsub-postgres";

const container = await createContainer(config, {
  adapters: {
    pubsub: (logger) => new PostgresPubSub({ connectionString: config.pubsubDatabaseUrl, logger }),
  },
});

await app.listen({ port: config.port, host: "0.0.0.0" });
await container.pubsub?.start();
await container.chatHub?.start();
```

Stop it after the outbox relay and the automation engine, so events still in flight
are forwarded: `await container.pubsub?.stop()`.

## Options

| Option             | Default  | Notes                                                        |
| ------------------ | -------- | ------------------------------------------------------------ |
| `connectionString` | required | A Postgres URL. It must reach Postgres directly (see below). |
| `logger`           | silent   | The container's logger.                                      |
| `pingIntervalMs`   | `30000`  | How often the adapter checks its listening connection.       |
| `pingTimeoutMs`    | `10000`  | How long a ping may take to come back.                       |

The adapter reads no environment itself. `apps/api` reads the connection string from
`PUBSUB_DATABASE_URL`, defaulting to `DATABASE_URL`.

## Connections

- **Listening.** `start()` opens one dedicated `pg.Client` with `keepAlive: true`,
  outside any pool, and runs `LISTEN hlms_pubsub`. Every channel shares that one Postgres
  channel; a notification carries the channel name and the adapter dispatches it to that
  channel's handlers.
- **Publishing.** `publish` runs `SELECT pg_notify('hlms_pubsub', $1)` on the adapter's
  own pool of 2 connections, with a 2 s connection timeout and a 2 s statement timeout,
  so a publish fails within about 2 s instead of waiting on an unreachable database. A
  publish reaches only the listeners connected when it commits. Publishing works without
  `start()`.
- **Poolers.** `LISTEN` needs a session connection. Behind a transaction-mode pooler,
  point the connection string at Postgres directly.

## Large messages

A message is serialized to JSON, encoded as UTF-8 and then as base64, so the payload is
ASCII and its length in characters is its length in bytes. A payload of up to 7,800
characters is sent as one notification. A longer one is split into 7,800-character parts
sent with `pg_notify` in one transaction, which Postgres delivers in the order they were
sent. The listener joins the parts and dispatches the message once all of them arrived;
parts not completed within 10 s, and all parts on reconnect, are dropped.

## Liveness and reconnects

Every 30 s the adapter publishes a ping and expects it back on its listening connection
within 10 s. A missing ping, an `error` or an `end` on the listening connection ends it;
the adapter reconnects with exponential backoff and full jitter (1 s up to 30 s), runs
`LISTEN` again and calls every subscriber's `onReset`.

`start()` makes the first connection attempt and resolves after it, connected or not; a
failed attempt is logged and retried as above, and `onReset` fires once it connects.
`stop()` stops the ping, runs `UNLISTEN *`, and closes the listening connection and the
pool. It is a no-op when the adapter was never started.

## Tests

The tests run against a real Postgres when `TEST_DATABASE_URL` is set and are skipped
otherwise.
