import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { eventTools } from './events.js';

const files = [{ assetId: 'ast_1', displayName: 'Slides' }];
const location = {
  venue: null,
  online: { url: 'https://zoom.us/j/123', details: 'Passcode 4821' },
};

const cases: ToolCase[] = [
  {
    tool: 'list_events',
    args: { status: 'published', from: '2026-05-01T00:00:00Z' },
    service: 'content.listEvents',
    expected: [
      { page: 1, pageSize: 20, status: 'published', from: new Date('2026-05-01T00:00:00Z') },
      OWNER,
    ],
  },
  {
    tool: 'get_event',
    args: { eventId: 'evn_1' },
    service: 'content.getEvent',
    expected: ['evn_1', OWNER],
  },
  {
    tool: 'create_event',
    args: {
      title: 'Conversation practice',
      startsAt: '2026-05-12T16:00:00Z',
      endsAt: '2026-05-12T17:00:00Z',
      timeZone: 'Europe/London',
      location,
      settings: { type: 'public', capacity: 20 },
    },
    service: 'content.createEvent',
    expected: [
      {
        title: 'Conversation practice',
        description: '',
        startsAt: new Date('2026-05-12T16:00:00Z'),
        endsAt: new Date('2026-05-12T17:00:00Z'),
        timeZone: 'Europe/London',
        location,
        settings: { type: 'public', capacity: 20 },
      },
      OWNER,
    ],
  },
  {
    tool: 'update_event',
    args: { eventId: 'evn_1', status: 'published', settings: { capacity: null } },
    service: 'content.updateEvent',
    expected: ['evn_1', { status: 'published', settings: { capacity: null } }, OWNER],
  },
  {
    tool: 'cancel_event',
    args: { eventId: 'evn_1' },
    service: 'content.cancelEvent',
    expected: ['evn_1', OWNER],
  },
  {
    tool: 'delete_event',
    args: { eventId: 'evn_1' },
    service: 'content.deleteEvent',
    expected: ['evn_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'add_event_attendee',
    args: { eventId: 'evn_1', orgUserId: 'ou_emma' },
    service: 'entitlements.grant',
    expected: [{ orgUserId: 'ou_emma', contentId: 'evn_1', expiresAt: null }, OWNER],
  },
  {
    tool: 'remove_event_attendee',
    args: { eventId: 'evn_1', orgUserId: 'ou_emma' },
    service: 'entitlements.revoke',
    expected: [{ orgUserId: 'ou_emma', contentId: 'evn_1' }, OWNER],
  },
  {
    tool: 'list_event_files',
    args: { eventId: 'evn_1' },
    service: 'content.listEventAssets',
    expected: ['evn_1', OWNER],
    returns: files,
  },
  {
    tool: 'add_event_file',
    args: { eventId: 'evn_1', assetId: 'ast_1' },
    service: 'content.addEventAsset',
    expected: ['evn_1', { assetId: 'ast_1' }, OWNER],
    returns: files,
  },
  {
    tool: 'rename_event_file',
    args: { eventId: 'evn_1', assetId: 'ast_1', displayName: 'Slides' },
    service: 'content.renameEventAsset',
    expected: ['evn_1', 'ast_1', 'Slides', OWNER],
    returns: files,
  },
  {
    tool: 'reorder_event_files',
    args: { eventId: 'evn_1', assetIds: ['ast_2', 'ast_1'] },
    service: 'content.reorderEventAssets',
    expected: ['evn_1', ['ast_2', 'ast_1'], OWNER],
    returns: files,
  },
  {
    tool: 'remove_event_file',
    args: { eventId: 'evn_1', assetId: 'ast_1' },
    service: 'content.removeEventAsset',
    expected: ['evn_1', 'ast_1', OWNER],
    returns: [],
  },
];

describe('event tools', () => {
  it('declare their operation and hints', () => {
    expect(toolSpecs(eventTools)).toEqual([
      ['list_events', 'content.listEvents', 'read', true, false],
      ['get_event', 'content.getEvent', 'read', true, false],
      ['create_event', 'content.createEvent', 'write', false, false],
      ['update_event', 'content.updateEvent', 'write', true, false],
      ['cancel_event', 'content.cancelEvent', 'destructive', false, false],
      ['delete_event', 'content.deleteEvent', 'destructive', true, false],
      ['add_event_attendee', 'entitlements.grant', 'write', true, false],
      ['remove_event_attendee', 'entitlements.revoke', 'destructive', false, false],
      ['list_event_files', 'content.listEventAssets', 'read', true, false],
      ['add_event_file', 'content.addEventAsset', 'write', false, false],
      ['rename_event_file', 'content.renameEventAsset', 'write', true, false],
      ['reorder_event_files', 'content.reorderEventAssets', 'write', true, false],
      ['remove_event_file', 'content.removeEventAsset', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(eventTools, c));
});
