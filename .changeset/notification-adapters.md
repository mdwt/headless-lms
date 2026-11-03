---
"@headless-lms/adapter-push": minor
"@headless-lms/adapter-workflow-hatchet": minor
"@headless-lms/adapter-email-templates": minor
"@headless-lms/adapter-email-resend": minor
"@headless-lms/adapter-email-ses": minor
---

`@headless-lms/adapter-push`: a new adapter that sends push notifications straight to APNs, FCM and Web Push behind the `PushSender` port, reports devices the provider answered as gone, and throws only when no device accepted and a failure was worth retrying.

`@headless-lms/adapter-workflow-hatchet` implements the new `Scheduler` port beside `AutomationEngine`, with a `scheduled-job` task for one-off and recurring product jobs and a `notification-delivery` task per email or push. `@headless-lms/adapter-email-templates` adds templates for mentions, reactions, course activities and comments on them, extends the digest with its posts, and links an activity email to the activity in its course. The Resend and SES adapters throw `EmailRejectedError` for a permanent refusal, so a notification email the provider refuses for good is failed without a retry.
