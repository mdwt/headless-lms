# Reporting — Read Domain

The read domain. It reads every other context and answers whoever needs data that no single context holds. It owns no data of its own and writes nothing. The other contexts do not import it. The HTTP layer and the composition root do.

There are two services, one per product. A person calls the service for the product they are logged into. Role is a guard on the route, not a third service.

## Scope

- Owns **composed reads** across the contexts. Each product has one service, and that service holds every read that product asks for.
- Reads the domains' data directly and computes each report on demand.
- Owns no records and no writes. It is purely a read side.

## Why it's a read domain

Domains own per-entity facts: progress knows one student's progress through one course, entitlements knows one grant. None aggregates _across_ entities, and they shouldn't — that would mean one context reaching across many. Reporting is where that aggregation lives: it reads the domains and rolls their facts up into reports. It owns nothing; every report is computed fresh from the domains' current data.

## Services

### `reporting/member`

The person in the member product. A student in a course, a member in a community, and a moderator all call this service. One org user. The course screen and the community screen call it for different methods. The screen does not choose a second reporting service, and the role does not either. Entitlements decide what that person can see.

- The courses, modules, and activities they can open.
- Their progress in a course.
- The downloads they can open, and the paywall in front of a download.
- **Directory** — the people in one community: members from their grants, each person's role, and their profile. No write-context owns this join.
- **Community home** — the spaces a person can open, with their counts.

The `/api/member` prefix is the member HTTP API. Its course, download, progress, directory, community-home, and asset URL routes call `reporting/member`. The asset URL is a composed read: the request names what the asset is being served as, the owning context says whether the member may see that thing, and assets signs. Comments and the org under that prefix call the context that owns the operation.

### `reporting/admin`

The person in the admin app. Owner, admin, and instructor call this service. The route guard decides whether that role may call the method.

- **Org overview** — across the whole org: total enrolments and trend, active learners, and completions.
- **Enrollment series** — enrolments over a window of days.
- **Course completion** — for a course, the enrolled count, average completion, and how many have finished, are in progress, or have stalled. Read across entitlements, progress, and the course structure. ("142 enrolled, 61% average completion, 38 finished, 17 stalled.")
- **Course engagement** — for a course, where students drop off: which lessons or assessments are completed by most and abandoned by most.
- **Learner record** — for one student, every course they're enrolled in, how far through each, and what they've completed. Read across their entitlements, their progress, and the course structure.
- **Learner activity** — for one student, what they've started but not finished, and when they were last active.
- **Roster** — the students list: each learner with their enrolment count and overall progress, filtered and paged.
- **Community staff analytics** — member count, active members, posts per space, comments per post, messages sent, flags raised and resolved, grants lapsed and renewed.

## Build state

`reporting/member` and `reporting/admin` are built. The member service answers courses, modules, activities, course progress, downloads, the community directory and the community home, each with the signed links of the files it shows. The admin service answers the org overview, the enrollment series, course analytics, the roster, a student's record, and community staff analytics.

## Boundaries

The contexts' boundaries hold because no context reaches into another. Reporting is the deliberate exception — it reads across all of them. It lives in `packages/core`, exported as `@headless-lms/core/reporting/*`, and the other contexts do not import it. Enforced by the boundary linter:

- Reporting may read the domains' data for aggregation — the one place allowed to depend on multiple contexts at once.
- Reporting writes to nothing and owns nothing.
- The other contexts may not depend on reporting.
- The inbound layer and composition may depend on reporting.
