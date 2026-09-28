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

### Adapters, Plugins, Integrations

There are 3 ways to change or extend the core service.

| Type             | Description                                                                                                                                  | Examples                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adapters**     | Infrastructure implementations that the core service requires. Swappable implementations of ports that handle external systems and services. | Authentication (Better Auth), Database (Drizzle/Postgres), Storage (MinIO/S3), Email (Resend/SES), Video, Event Bus, Cache (Redis/in-memory) |
| **Plugins**      | Functionality that extends the core service by adding new actions and triggers, schema changes, own workflows.                               | Extended comments, Community                                                                                                                 |
| **Integrations** | Third-party service connections that is triggered by events happening in the system. Automations triggered by system events.                 | CRM, Slack, Zapier/Make/Pabbly, Outgoing webhooks                                                                                            |

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
