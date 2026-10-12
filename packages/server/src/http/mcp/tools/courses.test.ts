import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { courseTools } from './courses.js';

const cases: ToolCase[] = [
  {
    tool: 'list_courses',
    args: { page: 2 },
    service: 'content.listCourses',
    expected: ['org_1', { page: 2, pageSize: 20 }],
  },
  {
    tool: 'list_modules',
    args: { courseId: 'crs_1' },
    service: 'content.listCourseModules',
    expected: ['org_1', 'crs_1'],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'create_course',
    args: { title: 'Intro' },
    service: 'content.createCourse',
    expected: ['org_1', { title: 'Intro', description: '', category: '' }],
  },
  {
    tool: 'update_course',
    args: { courseId: 'crs_1', status: 'published' },
    service: 'content.updateCourse',
    expected: ['org_1', 'crs_1', { status: 'published' }],
  },
  {
    tool: 'update_course_settings',
    args: { courseId: 'crs_1', transcriptDownloads: true },
    service: 'content.patchCourseSettings',
    expected: ['org_1', 'crs_1', { transcriptDownloads: true }],
  },
  {
    tool: 'create_module',
    args: { courseId: 'crs_1', title: 'Week 1' },
    service: 'content.createModule',
    expected: ['org_1', 'crs_1', 'Week 1'],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'rename_module',
    args: { courseId: 'crs_1', moduleId: 'mod_1', title: 'Week one' },
    service: 'content.updateModule',
    expected: ['org_1', 'crs_1', 'mod_1', 'Week one'],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'reorder_modules',
    args: { courseId: 'crs_1', orderedIds: ['mod_2', 'mod_1'] },
    service: 'content.reorderModules',
    expected: ['org_1', 'crs_1', ['mod_2', 'mod_1']],
    returns: [{ id: 'mod_2' }, { id: 'mod_1' }],
  },
  {
    tool: 'delete_course',
    args: { courseId: 'crs_1' },
    service: 'content.deleteCourse',
    expected: ['org_1', 'crs_1'],
    returns: undefined,
  },
  {
    tool: 'delete_module',
    args: { courseId: 'crs_1', moduleId: 'mod_1' },
    service: 'content.deleteModule',
    expected: ['org_1', 'crs_1', 'mod_1'],
    returns: [],
  },
];

describe('course tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(courseTools)).toEqual([
      ['list_courses', 'courses:read', 'read', true, false],
      ['list_modules', 'courses:read', 'read', true, false],
      ['create_course', 'courses:write', 'write', false, false],
      ['update_course', 'courses:write', 'write', true, false],
      ['update_course_settings', 'courses:write', 'write', true, false],
      ['create_module', 'courses:write', 'write', false, false],
      ['rename_module', 'courses:write', 'write', true, false],
      ['reorder_modules', 'courses:write', 'write', true, false],
      ['delete_course', 'courses:delete', 'destructive', true, false],
      ['delete_module', 'courses:delete', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(courseTools, c));
});
