import { describe, expect, it } from 'vitest';
import { ACCESS_SCOPES, isDeleteScope } from '@headless-lms/core/organizations';
import { fakeContainer, listTools, toolContext } from '../test-support.js';
import { TOOLS } from './index.js';

const NAMES = [
  'list_courses',
  'list_modules',
  'create_course',
  'update_course',
  'update_course_settings',
  'create_module',
  'rename_module',
  'reorder_modules',
  'delete_course',
  'delete_module',
  'list_downloads',
  'list_download_files',
  'create_download',
  'update_download',
  'add_download_file',
  'rename_download_file',
  'reorder_download_files',
  'remove_download_file',
  'delete_download',
  'list_bundles',
  'list_bundle_items',
  'create_bundle',
  'rename_bundle',
  'add_bundle_item',
  'remove_bundle_item',
  'delete_bundle',
  'list_media',
  'list_students',
  'update_student',
  'invite_student',
  'resend_student_invite',
  'list_access',
  'grant_access',
  'set_access_status',
  'get_dashboard',
  'get_enrollment_trend',
  'get_course_analytics',
  'get_course_enrollment_trend',
  'get_student_analytics',
  'list_automation_triggers',
  'list_automation_actions',
  'list_automations',
  'list_automation_runs',
  'create_automation',
  'update_automation',
  'rerun_automation_run',
  'delete_automation',
  'update_webhook',
  'delete_webhook',
  'list_comments',
  'publish_comment',
  'dismiss_comment_reports',
  'reply_to_comment',
  'remove_comment',
];

describe('tool registry', () => {
  it('is exactly the 54 designed tools, in order', () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(NAMES);
  });

  it('gives every tool a known scope and uses every scope', () => {
    const used = new Set(TOOLS.map((tool) => tool.scope));
    expect([...used].every((scope) => (ACCESS_SCOPES as readonly string[]).includes(scope))).toBe(
      true,
    );
    expect([...used].sort()).toEqual([...ACCESS_SCOPES].sort());
  });

  it('keeps read tools on read scopes and delete scopes on destructive tools', () => {
    for (const tool of TOOLS) {
      expect(tool.kind === 'read', tool.name).toBe(tool.scope.endsWith(':read'));
      if (isDeleteScope(tool.scope)) {
        expect(tool.kind, tool.name).toBe('destructive');
      }
    }
  });

  it('lists every tool with an object input schema and explicit hints', async () => {
    const listed = await listTools(toolContext(fakeContainer()), TOOLS);
    expect(listed.map((tool) => tool.name)).toEqual(NAMES);
    for (const tool of listed) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(Object.keys(tool.annotations ?? {}).sort(), tool.name).toEqual(
        ['destructiveHint', 'idempotentHint', 'openWorldHint', 'readOnlyHint', 'title'].sort(),
      );
    }
  });
});
