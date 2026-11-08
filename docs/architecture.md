# Headless LMS: Architecture

## Overview

This document outlines the project architecture so that anyone interested, human or otherwise knows how everything
fits together.

The idea of Headless LMS is to provide the building blocks to compose an LMS using any prefered techbologies or stacks.
It's intended to be "unopinionated", but it has a few strong opinions.

## Design, Architecture and Layout

The project follows Domain-Driven Design principles (DDD) by organizing functionality, boundaries and responsibilities
by business domains.

It's designed using the Ports and Adapters (Hexagonal) architecture to separate the infrastructure from the core
service.  
(it enables us to use different technologies without affecting the core functionality).
For example, for sending emails you can swop out Resend for SES, S3 for Minio, use NATS or Kafka for message queues,
Redis cache or in-memory.

Ports -> Interfaces defining what each part of the system can do, and what it needs to be able to do that.
Adapters -> The swappable implemenations of the interfaces.

This means there are a lot of interfaces defined in the core service, which in this case is a very good thing.

By default the repo ships with working adapters for everyting, so anyone can get going as-is or check the existing
adapters as reference when creating new ones.

### Access checks

Whether a member can open content is decided by the entitlements context. The one exception is the read permission
of each content type: `courses:read` and `downloads:read` open the item without a grant, unpublished included,
`communities:read` makes the person a member of the community and opens every space in it, and `events:read` opens
the event, its location, files and recording in any status.

- Services and the member surface call `EntitlementsService.hasAccess` / `listAccessibleContent`. A context that needs
  it declares a narrow `ContentAccessReader` port, wired to entitlements in composition.
- SQL reads the `content_access` view (`adapters/db/src/schema/entitlements.ts`) for cohorts, counts and community
  membership; `activeGrantCovers` in `grant-covers.ts` reads it too. It is the single definition of access: active
  grants, with bundle grants expanded to the bundle's current items.
- Nothing else filters `entitlements` on status, expiry or `content_id` to decide access, and HTTP handlers never gate
  access themselves.

### Permission checks

What a person may do is a permission check in the core service method that owns the action, never in a route, an
MCP tool or a repository. The organizations context owns the permission list, the roles and the assignments
(`docs/domain/organizations.md`).

- Every method a person can reach takes the caller as `actor`. `actor.permissions` answers
  `has(permission, contentId?)`, `require`, `anywhere`, `where` (for filtering lists), `roleOn` and `isOwner`.
  `Actor` and `EffectivePermissions` are in `core/shared`; organizations builds them with `actorFor`.
- The check runs against the item acted on, loaded by the method, never an id the client sent. Lists return
  everything to a holder on the org and filter to `where(...).content` otherwise. Creating an item needs the type's
  write permission on the org.
- Each service declares what each public method requires: permissions, `member`, `owner`, `system` or `public`
  (`declarations.ts`). Every route and MCP tool names the method it calls (`operation`); the OpenAPI descriptions and
  the MCP tool list are derived from the declaration.
- Routes and tools resolve the credential, ask organizations for the actor and call one method. They decide nothing.
  An API key or app token holds its scopes intersected with its creator's current permissions.
- Work the system does itself, and one context's reads of another's data to serve a person, run as
  `organizations.systemActor(orgId)`, which holds every permission and is never built from a request.
- No code compares a role's name or key. A lint rule refuses it.

### Serving files

Every file is fetched from a stable API URL that checks access on every request and redirects to a signed storage URL.
`FileUrls` (`@headless-lms/core/assets`) builds those URLs, and responses carry them in their file fields
(`thumbnailUrl`, `assetUrls`, `url`, `coverUrl`, `imageUrl`). The context that owns the file decides who may fetch it,
then calls `AssetFiles.signFile`. No response carries a signed storage URL, and no route serves a file by asset id
alone. A lesson's files are recorded on save from the editor's `assetIds(config)`; a file the lesson doesn't list is
not served. Download files use `DELIVERY_URL_EXPIRY`; every other file uses `STORAGE_DOWNLOAD_EXPIRY`.

### Adapters, Plugins, Integrations

There are 3 ways to change or extend the core service.

| Type             | Description                                                                                                                                  | Examples                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adapters**     | Infrastructure implementations that the core service requires. Swappable implementations of ports that handle external systems and services. | Authentication (Better Auth), Database (Drizzle/Postgres), Storage (MinIO/S3), Email (Resend/SES), Push (APNs, FCM and Web Push, `@headless-lms/adapter-push`), Workflows and scheduler (Hatchet), PubSub (Postgres `LISTEN/NOTIFY`), Video, Event Bus, Cache (Redis/in-memory) |
| **Plugins**      | Functionality that extends the core service by adding new actions and triggers, schema changes, own workflows.                               | Slack. Community is a content type in the core, not a plugin.                                                                                                                                                                                                                   |
| **Integrations** | Third-party service connections that is triggered by events happening in the system. Automations triggered by system events.                 | CRM, Slack, Zapier/Make/Pabbly                                                                                                                                                                                                                                                  |

The scheduler is a deployment port in `shared/ports`, beside `AutomationEngine`, and the workflow adapter implements
both: it runs automations, notification deliveries and the scheduled jobs the contexts define, such as publishing a
scheduled post or expiring grants.

### Events and PubSub

A write and its domain events commit together: the service appends the events to the outbox inside the write's
`UnitOfWork`. Every API process runs an outbox relay that publishes committed events on its in-process `EventBus`,
where automations handle them. An event is handled on whichever instance dispatched it.

`PubSub` is the deployment port, in `shared/ports`, for what every instance must hear: a message published on any
instance reaches every subscriber on every instance, best effort and unordered, with `onReset` after a reconnect.
Live chat is its one user. `ChatLiveForwarder` subscribes on the `EventBus` and publishes each chat change, ids only,
on `discussion.chats`; the `ChatHub` on each instance reads the current state and pushes it to the chat streams
connected there. The adapter is `@headless-lms/adapter-pubsub-postgres` (`LISTEN/NOTIFY`); a container built without
one has no hub, and the chat stream answers 503.

## Composition

Everything ships as packages and are composable at build time or runtime. A deployment is created with
the `create-headless-lms` cli which bootstraps a project.

### Core Server

The backend is two libraries: `@headless-lms/core` (`packages/core`) is the domain — the bounded contexts,
their ports and service implementations, plus the wire types (`@headless-lms/core/types`), zod schemas
(`@headless-lms/core/schemas`) and cross-context reporting (`@headless-lms/core/reporting/*`).
`@headless-lms/server` (`packages/server`) is composition (`app/`) and the web server (`http/`) — nothing else.

**Everything** in this project are replacable and is built like that from the start. The core service defines the
interfaces that adapters implement.

The core is organized by context (or domain), and each domain defines its ports and service implementations.
A context is imported only through its `index.ts` (`@headless-lms/core/<context>`).
There is no orchastration layer at this point - and that's a decision that ensures that each use case has a domain
owner as we build out the system.

### Ownership

Every record has one owning context. The owner is decided by what the record is about, not by who it is for, which
context delivers it, or which app shows it. A person's own records are identity's: profile, notification settings,
devices. A person's state about something another context owns belongs to that context: a follow, bookmark,
reaction, flag or mute on a post, space or chat is discussion's. Progress is state of that kind with a context of
its own. A record of something the system did belongs to the context that did it: a notification the server sent,
and its deliveries, are automations', which runs that process. A record keyed by another context's item, or read
only by another context, is in the wrong place.

### Reporting

Reporting is the read domain. It lives in `packages/core` as `@headless-lms/core/reporting/*`. It reads every
context, owns no data, and writes nothing. The other contexts do not import it. The HTTP layer and the composition
root do.

There are two services, one per product. A person calls the service for the product they are logged into. Each
method checks the caller's permissions itself; there is no service per role.

`reporting/member` is the person in the member product: a learner in a course, a member in a community, a moderator.
It answers the courses, progress, and downloads they can open, the community directory, the community home, the
events they can see with their calendar file and attendees, the notification list, the unread counts, and the
notification settings view. The `/api/member` prefix is the member HTTP API. Its course, download, progress,
directory, community-home, event read, event list, event calendar, event attendee list, notification list, unread
count and notification settings view routes call `reporting/member`. The other routes under that prefix call the
context that owns the operation.

`reporting/admin` is the person in the admin app, whatever their role. It answers the org overview
(`analytics:read`), course analytics (`progress:read` on the course), the roster and a learner's record
(`people:read`), a community's members (`access:read`), the community analytics (`communities:read` on the
community), and an event's attendees and analytics (`events:read` on the event).

`reporting/member` and `reporting/admin` are the services in the code.

| Type        | Description                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ |
| **Fastify** | It's fast, easy to learn, automatic validation, spec generation is easy, plugin architecture, DX |
| **Drizzle** | It's easy to understand, popular, no extra runtime                                               |

### Project Layout

The project is a pnpm monorepo and should be easy to follow.

```
apps/           ## Default frontends, bootstrapped server app
packages/       ## Core packages - all published as npm packages and linkable as workspace:*
plugins/        ## Platform and feature extensions
integrations/   ## 3rd party integrations
adapters/       ## Adapter implemenations (core infrastructure)
```

## Headlessness

This is a headless LMS, meaning you can use anything to build your end user experiences. The idea is to have a
backend service that gives you everything you need to build your own LMS frontend if you need to.

This means you can use the existing Admin frontend to manage everyting ito users, signups, access, storage, files etc. and
replace the course editor with your own. The system stores whatever you need and allows you to render whatever you want
with that data.

It defines the content structure - e.g. a **Course**

I like Slate.js, and I've done other work using Plate.js, so the default course content builder is an engine built
on Plate.js. Some people love TipTap, some people has existing SCORM frontends. The [editor contract](../packages/editor/src/index.ts)
(`@headless-lms/editor`) is what you'll use to implement your frontend.

### Defaults

Out of the box it's a fully functional system. It comes with frontends, a course builder, emails and everything you need.
There is a fully funtional Admin portal and Student portal.

| Type       | Description                                        |
| ---------- | -------------------------------------------------- |
| **Admin**  | NextJS, ShadCN, Plate.js course builder            |
| **Emails** | It's easy to understand, popular, no extra runtime |
