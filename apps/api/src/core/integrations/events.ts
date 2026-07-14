// integrations context — domain events (published on the shared EventBus).
import type { DomainEvent } from "../shared/ports.js";

export interface ConnectionCreated extends DomainEvent {
  type: "connection.created";
  orgId: string;
  connectionId: string;
  service: string;
}

export interface ConnectionUpdated extends DomainEvent {
  type: "connection.updated";
  orgId: string;
  connectionId: string;
  service: string;
  /** What changed: the stored credential or the configuration/active flag. */
  changed: "credentials" | "configuration";
}

export interface ConnectionRemoved extends DomainEvent {
  type: "connection.removed";
  orgId: string;
  connectionId: string;
  service: string;
}
