# Reporting — Read Domain

The read domain. It reads every other context and answers whoever needs data that no single context holds. It owns no data of its own and writes nothing. The other contexts do not import it. The HTTP layer and the composition root do.

There are two services, one per product. A person calls the service for the product they are logged into. Each read checks the person's permissions itself; there is no service per role.

## Scope

- Owns **composed reads** across the contexts. Each product has one service, and that service holds every read that product asks for.
- Reads the domains' data directly and computes each report on demand.
- Owns no records and no writes. It is purely a read side.

## Why it's a read domain

Domains own per-entity facts: progress knows one student's progress through one course, entitlements knows one grant. None aggregates _across_ entities, and they shouldn't — that would mean one context reaching across many. Reporting is where that aggregation lives: it reads the domains and rolls their facts up into reports. It owns nothing; every report is computed fresh from the domains' current data.

## Services

### `reporting/member`

The person in the member product. A student in a course, a member in a community, and a moderator all call this service. One org user. The course screen and the community screen call it for different methods. The screen does not choose a second reporting service, and the person's roles do not either. Entitlements decide what that person can see, and the read permission of a content type opens it without a grant.

- The courses, modules, and activities they can open.
- Their progress in a course.
- The downloads they can open, and the paywall in front of a download.
- **Directory** — the people in one community: members from their grants and holders of `communities:read` on it, each with their profile and, for team, the name of their role there. No write-context owns this join.
- **Community home** — every space of the community with its topics, links, post defaults, member count and where the person stands with it, plus the community's description and direct-message settings, and whether the person can create events. One space can be read on its own in the same shape.
- **Events** — an event as the person may see it. A holder of `events:read` on it sees it in any status, with everything. An attendee, directly or through a bundle, sees a published or canceled event with its location and files, and its recording after the end when replay is on. Anyone else in the org sees a published `public` event without its location, files and recording. Each event carries its attendee count, the faces of up to ten attendees, the places left, and what the person can do with it: whether they attend, can register, can open it, can manage its attendees, can edit, cancel or delete it. The events can be listed upcoming or past, and only the ones the person attends.
- **Event calendar file** — the event as a calendar entry with its title, times and event page, and its location and meeting link when the person can open it.
- **Event attendees** (`events:read`) — the people attending, each with their name, photo, how they got their place (registered, added, automation or bundle) and when, by date.
- **Notification list** — the person's notifications shown in the app, newest first, filtered by community, category, reason, kind or unread, with the current titles and names of what they are about. Something the person can no longer open, or that was deleted, is left blank.
- **Unread counts** — how many unread notifications the person has outside any community, and in each community they can open.
- **Notification settings** — the person's notification settings in a community or for the org: each category with its channels, what each is set to, what it would be without the person's own choice, and, for a category set per space, each space they can open. A community's settings also carry its digest schedule.

The `/api/member` prefix is the member HTTP API. Its course, download, progress, directory and community-home routes, the event reads, the event calendar file and the event attendee list, the notification list, the unread counts and the read of the notification settings call `reporting/member`, as do the file links for the thumbnails and covers of unpublished items, lesson files, download files and event files: entitlements says whether the member may open the item, content says whether the file belongs to it, and assets signs the storage link. Profile photos and the thumbnails and covers of published items are public images with no route. Comments, the org, marking notifications read and changing notification settings under that prefix call the context that owns the operation.

### `reporting/admin`

The person in the admin app, whatever their role. Each report needs a permission, and a course report needs it on that course.

- **Org overview** (`analytics:read`) — across the whole org: total enrolments and trend, active learners, completions, and the number of upcoming events.
- **Enrollment series** (`analytics:read`) — enrolments over a window of days.
- **Course completion** (`progress:read`) — for a course, the enrolled count, average completion, and how many have finished, are in progress, or have stalled. Read across entitlements, progress, and the course structure. ("142 enrolled, 61% average completion, 38 finished, 17 stalled.")
- **Course engagement** (`progress:read`) — for a course, where students drop off: which lessons or assessments are completed by most and abandoned by most.
- **Learner record** (`people:read`) — for one learner, every course they're enrolled in, how far through each, and what they've completed. Read across their entitlements, their progress, and the course structure.
- **Learner activity** (`people:read`) — for one learner, what they've started but not finished, and when they were last active.
- **Roster** (`people:read`) — the people whose org role is Member: each learner with their enrolment count and overall progress, filtered and paged.
- **Community members** (`access:read`) — the people who hold a community, directly or through a bundle, searched and paged.
- **Community analytics** (`communities:read`) — member count, active members, posts per space, comments per post, messages sent, flags raised and resolved, grants lapsed and renewed.
- **Event attendees** (`events:read`) — the people attending an event, directly or through a bundle, each with how they got their place and when, by date.
- **Event analytics** (`events:read`) — for an event, the attendees now and how many came by each source (registered, added, automation, bundle), the capacity, the direct grants now revoked, and the current direct grants by grant date up to the start. ("9 attendees: 7 registered, 1 added, 1 through a bundle; 1 revoked.")

## Build state

`reporting/member` and `reporting/admin` are built. The member service answers courses, modules, activities, course progress, downloads, the community directory, the community home and events with their calendar file and attendees, each with the stable links of the files it shows, and the notification list, the unread counts and the notification settings. The admin service answers the org overview, the enrollment series, course analytics, the roster, a learner's record, community members, community analytics, and event attendees and analytics.

## Boundaries

The contexts' boundaries hold because no context reaches into another. Reporting is the deliberate exception — it reads across all of them. It lives in `packages/core`, exported as `@headless-lms/core/reporting/*`, and the other contexts do not import it. Enforced by the boundary linter:

- Reporting may read the domains' data for aggregation — the one place allowed to depend on multiple contexts at once.
- Reporting writes to nothing and owns nothing.
- The other contexts may not depend on reporting.
- The inbound layer and composition may depend on reporting.
