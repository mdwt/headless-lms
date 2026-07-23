// progress context — domain events, owned by @headless-lms/types.
import type { NewDomainEvent } from '../shared/ports.js';
import type { ProgressEvent } from '@headless-lms/types';

export type { ProgressEvent, ProgressStarted, ProgressCompleted } from '@headless-lms/types';
export type NewProgressEvent = NewDomainEvent<ProgressEvent>;
