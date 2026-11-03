import type { RecurringJob, ScheduledJob } from '../shared/ports.js';
import type { EntitlementsService } from './ports.js';

export const GRANTS_EXPIRE_JOB = 'entitlements.grants.expire';

export interface EntitlementsJobDeps {
  grants: Pick<EntitlementsService, 'expireDueGrants'>;
}

export function entitlementsJobs(deps: EntitlementsJobDeps): ScheduledJob[] {
  return [
    {
      job: GRANTS_EXPIRE_JOB,
      async run(_payload, fire) {
        await deps.grants.expireDueGrants(fire.startedAt);
      },
    },
  ];
}

export const entitlementsRecurringJobs: RecurringJob[] = [
  { job: GRANTS_EXPIRE_JOB, cron: '0 * * * *' },
];
