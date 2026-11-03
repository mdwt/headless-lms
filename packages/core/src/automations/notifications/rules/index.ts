import type { RecipientRule } from '../../ports.js';
import { DISCUSSION_RULES } from './discussion.js';

export const RECIPIENT_RULES: Record<string, RecipientRule> = {
  ...DISCUSSION_RULES,
};
