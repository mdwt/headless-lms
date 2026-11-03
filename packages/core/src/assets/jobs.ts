import type { Logger, RecurringJob, ScheduledJob } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { AssetsService, OrgDirectory } from './ports.js';

export const UPLOADS_REMOVE_UNATTACHED_JOB = 'assets.uploads.removeUnattached';

export interface AssetsJobDeps {
  assets: Pick<AssetsService, 'removeUnattached'>;
  orgs: OrgDirectory;
  logger?: Logger;
}

export function assetsJobs(deps: AssetsJobDeps): ScheduledJob[] {
  const logger = deps.logger ?? noopLogger;
  return [
    {
      job: UPLOADS_REMOVE_UNATTACHED_JOB,
      async run(_payload, fire) {
        let failed = 0;
        for (const orgId of await deps.orgs.orgIds()) {
          try {
            await deps.assets.removeUnattached(orgId, fire.startedAt);
          } catch (err) {
            failed += 1;
            logger.error('unattached uploads not swept', { orgId, err });
          }
        }
        if (failed > 0) {
          throw new Error(`unattached uploads of ${failed} orgs could not be swept`);
        }
      },
    },
  ];
}

export const assetsRecurringJobs: RecurringJob[] = [
  { job: UPLOADS_REMOVE_UNATTACHED_JOB, cron: '0 * * * *' },
];
