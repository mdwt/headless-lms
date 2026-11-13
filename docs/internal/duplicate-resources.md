# Duplicating a course or a community

Findings and design for [#40](https://github.com/mdwt/headless-lms/issues/40). Not built. Blocked on
[#42](https://github.com/mdwt/headless-lms/issues/42).

## The request

One call that copies a course or a community inside the same organization and returns the copy. Today an admin
reads the original and recreates it call by call, which is not atomic and leaves a partial copy when one call fails.

## What other APIs do

About 40 public APIs were checked. Roughly half offer duplication at all. Only Canvas, Moodle and Docebo duplicate a
whole course; none duplicates a community or a space. Thinkific, Kajabi, Teachable, Mighty Networks and Circle (for
courses and spaces) have Duplicate in the GUI and not in the API.

| Shape                                   | Who                                                             | Example                                  |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Action on the source (about 15)         | Asana, Google Drive, Box, Figma, Circle, Docebo, Eventbrite     | `POST /projects/{id}/duplicate`          |
| Source parameter on the normal create   | Trello, Notion, Zoom, ClickUp                                   | `POST /cards` with `idCardSource`        |
| Separate migration or job resource      | Canvas, Moodle import                                           | `POST /courses/{id}/content_migrations`  |
| Not offered (about 15)                  | Stripe, Linear, Typeform, Webflow, Strapi, most course platforms | n/a                                      |

- "duplicate" and "copy" are used equally. File storage says "copy", application content says "duplicate".
- The name is required from the caller (Asana, Shopify, Moodle) or an optional override (Box, Drive, SendGrid).
  Only Circle documents a generated suffix, `" (copy)"`.
- User data (enrollments, members, comments, completion) is left out by default everywhere.
- A single resource returns the copy directly. A tree usually returns a job to poll (Asana, Canvas); Moodle's course
  duplicate returns directly.

## Agreed design

```
POST /api/courses/:courseId/duplicate          body { title? }  → 201 Course
POST /api/communities/:communityId/duplicate   body { title? }  → 201 Community
```

- An action on the source, like `POST /api/communities/:communityId/publish` and `POST /api/events/:eventId/cancel`.
- Everything content holds on the item is copied, in one transaction.
  - Course: the course, its settings and thumbnail, every module in order, every activity in order with its
    settings blob and asset links.
  - Community: the community and its thumbnail, its DM settings, digest schedule and notification categories, every
    space in order with its settings, access rule, capacity, cover, background, icon, topics and links.
- The copy uses the same library files as the original. No bytes are copied. A referenced asset cannot be deleted, so
  deleting the original leaves the copy intact.
- The title is the one given, or the original's with " (copy)". The slug comes from the title, with a number appended
  when it is taken.
- The copy starts as a draft.
- The copy emits every event a normal build emits (`course.created`, `module.created`, `activity.created`,
  `community.created`, `community.space.created` and the `updated` events of the steps used), saved in the same
  transaction.
- The caller needs the type's read permission on the source and its write permission on the org, as for a create.
- Enrollments, progress, members, posts, comments and messages belong to other contexts and are keyed by the
  original's id, so they are never read.

## The constraint

The copy must not be a second place that knows how a course or a community is built. A rule changed in the normal
API has to apply to the copy without a second edit. So the copy holds no rules: it reads the original and calls the
existing content service methods (`createCourse`, `updateCourse`, `patchCourseSettings`, `createModule`,
`saveActivity`, `createCommunity`, `createSpace`, `setSpaceTopics`, `addSpaceLink`, …) with the values it read.

## Why that does not work today

1. **A unit of work does not join one that is already open.** `DrizzleUnitOfWork.run`
   (`adapters/db/src/unit-of-work.ts`) always calls `db.transaction` on the root pool. Every service method opens
   its own, so calling them one after another, or inside an outer `run`, gives separate transactions on separate
   connections. A failure halfway leaves a partial copy.
2. **Reads outside the unit of work use the root connection.** The service methods also read through the plain
   repository, such as the "is this file already attached" lookup in `updateCourse` and `saveActivity`
   (`assertAttachable` in `packages/core/src/content/service.ts`). Inside an outer transaction those reads would not
   see the uncommitted copy.
3. **The file check refuses some callers.** `updateCourse`, `saveActivity` and `updateSpace` refuse a file that was
   not uploaded for that item unless the caller holds `media:read`. The copy's files were uploaded for the original,
   so an author without `media:read` gets a 403 duplicating their own course.

## What has to change first

Tracked in [#42](https://github.com/mdwt/headless-lms/issues/42).

- `run` joins the transaction already open for the current call chain instead of opening a new one. Node's
  `AsyncLocalStorage` carries it; the logging adapter already uses it for the request context
  (`adapters/defaults/src/logging/request-context.ts`).
- The repositories read through that same open transaction.
- Core does not change. `UnitOfWork` keeps its one method.

With that in place, duplicate is one service method per type:

```
duplicateCourse(id, input, actor)
  uow.run(() =>
    createCourse(…)
    updateCourse(…)            thumbnail
    patchCourseSettings(…)
    createModule(…)            per module
    saveActivity(…)            per activity)
```

The route and the MCP tool each build the actor and call that method. The SDK operation is generated from the
OpenAPI spec.

## Open decision

The file check (point 3): either duplicate requires `media:read`, or the check accepts a file the source item
already uses.

## Things to know when building

- `createCourse` takes only title, description and category, and `createSpace` takes no images. The thumbnail,
  settings and space images go through the update and settings methods, as an admin sets them today.
- `createModule` and `saveActivity` each return the course's full module list, so a large course lists its modules
  once per step.
- Slugs are unique per org and a create returns 409 when one is taken (`slugify` in the content service).
- The service methods sync public images after their unit of work. The copy is a draft, so there is nothing to
  publish.
