import type { RecipientRule } from '../../ports.js';
import { CONTENT_RULES } from './content.js';
import { DISCUSSION_RULES } from './discussion.js';
import { ENTITLEMENT_RULES } from './entitlements.js';
import { ORGANIZATION_RULES } from './organizations.js';

export const RECIPIENT_RULES: Record<string, RecipientRule> = {
  ...DISCUSSION_RULES,
  ...ENTITLEMENT_RULES,
  ...CONTENT_RULES,
  ...ORGANIZATION_RULES,
};
