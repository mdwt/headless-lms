import type { MailerSources } from '@headless-lms/core/shared/mailer';
import type { App } from '@headless-lms/core/types';

export type MailerSourceReads = {
  organization: (orgId: string) => Promise<{
    id: string;
    name: string;
    slug: string;
    metadata: Record<string, string>;
  } | null>;
  apps: (orgId: string) => Promise<App[]>;
  person: (email: string) => Promise<{
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null>;
};

export function createMailerSources(reads: MailerSourceReads): MailerSources {
  return {
    organization: async (orgId) => {
      const [organization, apps] = await Promise.all([
        reads.organization(orgId),
        reads.apps(orgId),
      ]);
      return organization
        ? {
            organization: {
              id: organization.id,
              name: organization.name,
              slug: organization.slug,
              metadata: organization.metadata,
            },
            apps,
          }
        : null;
    },
    recipient: async (address) => {
      const person = await reads.person(address);
      return person
        ? { id: person.id, firstName: person.firstName, lastName: person.lastName }
        : null;
    },
  };
}
