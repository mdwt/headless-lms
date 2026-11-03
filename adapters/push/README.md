# @headless-lms/adapter-push

Implementation of the `PushSender` port from `@headless-lms/core/shared/ports`. It sends to the
platform push services directly, with no third-party push service in between:

| Provider  | Sent through                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apns`    | HTTP/2 to `api.push.apple.com`, or `api.sandbox.push.apple.com` for a `sandbox` device; token auth with the team's `.p8` key, the token re-signed every 50 minutes; `apns-topic` is the device's app id |
| `fcm`     | FCM HTTP v1 with the service account; its access token is kept until it expires                                                                                                                         |
| `webpush` | the subscription's endpoint, signed with the VAPID key pair and encrypted (`aes128gcm`) with the subscription's `p256dh` and `auth` keys                                                                |

The adapter reads no environment itself. The installation's `config.ts` parses env into a
`PushConfig` (`@headless-lms/core/types`) and injects the adapter beside it; the server registers
the `push` notification channel when at least one provider is configured:

```ts
import { PushAdapter } from "@headless-lms/adapter-push";

const push = loadPushConfig();
const container = await createContainer(config, {
  adapters: {
    push,
    pushSender: new PushAdapter(push),
  },
});
```

## Payload

Every provider receives the message's `title` and `body` and its `data`:
`{ notificationId, type, subject, parent, communityId, spaceId }`; `communityId` and `spaceId` are
null for a notification outside a community or a space.

- APNs: `{ aps: { alert: { title, body } }, data }`.
- FCM: `notification: { title, body }` and `data`, whose values FCM requires to be strings:
  `subject` and `parent` are JSON-encoded `{ type, id }`; each of the four is left out when absent.
- Web Push: the JSON `{ title, body, data }`, which the service worker's `push` event reads.

## Results

`send(devices, message)` sends to every device and returns `{ accepted, deadDeviceIds, error? }`:
`accepted` is true when at least one device accepted; `deadDeviceIds` are the devices the provider
answered as gone, which the caller deletes; `error` names each device's answer when none accepted.

| Provider  | Dead when the provider answers                                             |
| --------- | -------------------------------------------------------------------------- |
| `apns`    | `410` (`Unregistered`), `400 BadDeviceToken`, `400 DeviceTokenNotForTopic` |
| `fcm`     | `404 UNREGISTERED`, `400 INVALID_ARGUMENT`, `403 SENDER_ID_MISMATCH`       |
| `webpush` | `404`, `410`                                                               |

`send` succeeds when at least one device accepted. It throws, so the delivery is retried, only when
no device accepted and at least one failure was worth retrying: a network error, `429` or `5xx`.
When no device accepted and none of the failures is worth retrying, it returns `accepted: false`,
and the delivery is failed with `error` without a retry.
An APNs `403 ExpiredProviderToken` or an FCM `401` also drops the cached token and counts as
retryable.

## Environment variables (reference installation)

Each provider is configured when all of its variables are set.

| Variable              | Provider | Notes                                                             |
| --------------------- | -------- | ----------------------------------------------------------------- |
| `APNS_TEAM_ID`        | APNs     | Apple developer team id                                           |
| `APNS_KEY_ID`         | APNs     | id of the `.p8` key                                               |
| `APNS_KEY`            | APNs     | the `.p8` key, `\n` for newlines                                  |
| `APNS_BUNDLE_IDS`     | APNs     | comma-separated bundle ids of the apps the key serves             |
| `FCM_SERVICE_ACCOUNT` | FCM      | the Firebase project's service account JSON                       |
| `VAPID_PUBLIC_KEY`    | Web Push | from `npx web-push generate-vapid-keys`; the same on every server |
| `VAPID_PRIVATE_KEY`   | Web Push |                                                                   |
| `VAPID_SUBJECT`       | Web Push | a `mailto:` or `https:` contact                                   |
