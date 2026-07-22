# Reporting — Read Domain

A read-only domain for cross-domain aggregation — the reports no single domain can answer. It reads across the other domains' data and aggregates on demand. It owns no tables and no data of its own, writes to nothing, and nothing depends on it.

## Scope

- Owns **composed reads**: cross-domain aggregation for the management dashboard — across students, courses, and the org.
- Reads the domains' data directly and computes each report on demand.
- Owns no tables, no records, no writes. It is purely a read side.

## Why it's a read domain

Domains own per-entity facts: progress knows one student's progress through one course, entitlements knows one grant. None aggregates *across* entities, and they shouldn't — that would mean one context reaching across many. Reporting is where that aggregation lives: it reads the domains and rolls their facts up into reports. It owns nothing; every report is computed fresh from the domains' current data.

## Reports

- **Course completion** — for a course, the enrolled count, average completion, and how many have finished, are in progress, or have stalled. Read across entitlements, progress, and the course structure. ("142 enrolled, 61% average completion, 38 finished, 17 stalled.")
- **Course engagement** — for a course, where students drop off: which lessons or assessments are completed by most and abandoned by most.
- **Learner record** — for one student, every course they're enrolled in, how far through each, and what they've completed. Read across their entitlements, their progress, and the course structure.
- **Learner activity** — for one student, what they've started but not finished, and when they were last active.
- **Org overview** — across the whole org: total enrolments and trend, active learners, and completions.
- **Roster** — the students list: each learner with their enrolment count and overall progress, filtered and paged.

These are representative — reporting serves whatever cross-domain view the dashboard needs.

## Boundaries

The core's boundaries hold because no domain reaches into another. Reporting is the deliberate exception — it reads across all of them — so it lives apart, a sibling of the core. Enforced by the boundary linter:

- Reporting may read the domains' data for aggregation — the one place allowed to depend on multiple contexts at once.
- Reporting writes to nothing and owns no tables.
- The core may not depend on reporting.
- The inbound layer and composition may depend on reporting.
