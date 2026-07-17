# @headless-lms/types

The platform's published type surface: domain entities, DTOs, domain events
(`enrollment.created`, `connection.updated`, …), and the integration contract
(`Integration`, `Action`, `ActionContext`, `Validation`).

Pure type declarations — no runtime code, no dependencies. One file per bounded
context, mirroring `apps/api/src/core/`. The api's core imports these types
rather than declaring its own, so an integration package and the platform always
share one definition.

```ts
import type { Integration, EnrollmentCreated, Course } from "@headless-lms/types";
```
