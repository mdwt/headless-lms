import { describe, expect, it } from 'vitest';
import { declarationOf } from '../../operations.js';
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
  'list_events',
  'get_event',
  'create_event',
  'update_event',
  'cancel_event',
  'delete_event',
  'list_event_attendees',
  'get_event_analytics',
  'add_event_attendee',
  'remove_event_attendee',
  'list_event_files',
  'add_event_file',
  'rename_event_file',
  'reorder_event_files',
  'remove_event_file',
  'list_students',
  'invite_student',
  'resend_student_invite',
  'list_access',
  'grant_access',
  'set_access_status',
  'get_dashboard',
  'get_enrollment_trend',
  'get_course_analytics',
  'list_course_learners',
  'get_course_enrollment_trend',
  'get_student_analytics',
  'update_organization',
  'list_roles',
  'get_role',
  'update_role',
  'create_role',
  'reset_role',
  'delete_role',
  'list_team',
  'list_person_roles',
  'list_roles_on_content',
  'set_org_role',
  'assign_role',
  'unassign_role',
  'invite_person',
  'cancel_invite',
  'remove_person',
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
  'list_communities',
  'list_spaces',
  'create_community',
  'update_community',
  'update_community_messaging',
  'create_space',
  'update_space',
  'reorder_spaces',
  'set_space_topics',
  'add_space_link',
  'reorder_space_links',
  'remove_space_link',
  'delete_space',
  'delete_community',
  'get_community_analytics',
  'list_community_members',
  'list_space_members',
  'add_space_member',
  'invite_space_member',
  'approve_space_request',
  'decline_space_request',
  'remove_space_member',
  'get_space_moderation_queue',
  'get_message_moderation_queue',
  'approve_post',
  'dismiss_post_flags',
  'remove_post',
  'restore_post',
  'dismiss_post_comment_flags',
  'remove_post_comment',
  'restore_post_comment',
  'dismiss_message_flags',
  'lock_chat',
  'unlock_chat',
];

describe('tool registry', () => {
  it('is exactly the designed tools, in order', () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(NAMES);
  });

  it('names a declared operation a token can reach for every tool', () => {
    for (const tool of TOOLS) {
      const declaration = declarationOf(tool.operation);
      expect(
        declaration === 'member' || (declaration !== null && typeof declaration === 'object'),
        tool.name,
      ).toBe(true);
    }
  });

  it('keeps read tools on read permissions and delete permissions on destructive tools', () => {
    for (const tool of TOOLS) {
      const declaration = declarationOf(tool.operation);
      const permissions =
        declaration && typeof declaration === 'object' ? declaration.permissions : [];
      if (tool.kind === 'read') {
        expect(
          permissions.length === 0 ||
            permissions.some((p) => p.endsWith(':read') || p.endsWith(':moderate')),
          tool.name,
        ).toBe(true);
      }
      if (permissions.some((p) => p.endsWith(':delete'))) {
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
