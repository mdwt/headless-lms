# Headless LMS: Architecture

## Overview

This document outlines the project architecture so that anyone knows how everything
fits together.

The idea of Headless LMS is to provide the building blocks to compose an LMS using any prefered techbologies or stacks.

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

By default the repo ships with working adapters for everyting, so anyone can get going as-is or check the existing
adapters as reference when creating new ones.

### Adapters, Plugins, Integrations

There are 3 ways to change or extend the core service.

| Type             | Description                                                                                                                                  | Examples                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adapters**     | Infrastructure implementations that the core service requires. Swappable implementations of ports that handle external systems and services. | Authentication (Better Auth), Database (Drizzle/Postgres), Storage (MinIO/S3), Email (Resend/SES), Push (APNs, FCM and Web Push), Workflows and scheduler (Hatchet), PubSub (Postgres), Video, Event Bus, Cache (Redis/in-memory) |
| **Plugins**      | Functionality that extends the core service by adding new actions and triggers, schema changes, own workflows.                               | Slack. Community is a content type in the core, not a plugin.                                                                                                                                                                                                                   |
| **Integrations** | Third-party service connections that is triggered by events happening in the system. Automations triggered by system events.                 | CRM, Slack, Zapier/Make/Pabbly                                                                                                                                                                                                                                                  |

The workflow adapter runs automations, notification deliveries and the scheduled work the contexts define, such as
publishing a scheduled post or expiring grants.

### Events and PubSub

A change and the events it raises are saved together, so no event is lost and none is sent for a change that did not
happen. Automations react to those events.

Some things every running server must hear. When James sends a message in a chat, everyone connected to that chat
sees it, whichever server they are connected to. Live chat is the only thing that uses this today.

## Composition

Everything ships as packages and are composable at build time or runtime. A deployment is created with
the `create-headless-lms` cli which bootstraps a project.

### Core Server

The backend has two parts. The core is the domain: the contexts, what each one needs from the outside, and what
each one does. The server wires the adapters into the core and exposes it to the outside world. It holds no logic of
its own.

**Everything** in this project are replacable and is built like that from the start. The core service defines the
interfaces that adapters implement.

The core is organized by context (or domain). A context uses another only through what that context makes public.
There is no orchastration layer at this point - and that's a decision that ensures that each use case has a domain
owner as we build out the system.

### Reporting

Reporting is the read domain. It reads every context, owns no data and writes nothing. No other context depends on
it.

There is one reporting service per product, and a person uses the one for the product they are signed into. Each
read checks the caller's permissions itself; there is no service per role.

- **Member** is the person in the member product: a learner in a course, a member in a community, a moderator. It
  answers what they can open and where they are: their courses, progress and downloads, the community directory and
  home, events, and notifications.
- **Admin** is the person in the admin app, whatever their role. It answers the org overview, course analytics, the
  roster, community members and analytics, and event attendees and analytics.

For example, Sarah opens her community's home. Member reporting reads the spaces from content, her access from
entitlements and the latest posts from discussion, and returns one view.

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
on Plate.js. Some people love TipTap, some people has existing SCORM frontends. The editor contract is what you'll
use to implement your frontend.

### Defaults

Out of the box it's a fully functional system. It comes with frontends, a course builder, emails and everything you need.
There is a fully funtional Admin portal and Student portal.

| Type       | Description                                        |
| ---------- | -------------------------------------------------- |
| **Admin**  | NextJS, ShadCN, Plate.js course builder            |
| **Emails** | It's easy to understand, popular, no extra runtime |
