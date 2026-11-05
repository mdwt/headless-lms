import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { courseTools } from './courses.js';

const cases: ToolCase[] = [
  {
    tool: 'list_courses',
    args: { page: 2 },
    service: 'content.listCourses',
    expected: [{ page: 2, pageSize: 20 }, OWNER],
  },
  {
    tool: 'list_modules',
    args: { courseId: 'crs_1' },
    service: 'content.listCourseModules',
    expected: ['crs_1', OWNER],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'create_course',
    args: { title: 'Intro' },
    service: 'content.createCourse',
    expected: [{ title: 'Intro', description: '', category: '' }, OWNER],
  },
  {
    tool: 'update_course',
    args: { courseId: 'crs_1', status: 'published' },
    service: 'content.updateCourse',
    expected: ['crs_1', { status: 'published' }, OWNER],
  },
  {
    tool: 'update_course_settings',
    args: { courseId: 'crs_1', transcriptDownloads: true },
    service: 'content.patchCourseSettings',
    expected: ['crs_1', { transcriptDownloads: true }, OWNER],
  },
  {
    tool: 'create_module',
    args: { courseId: 'crs_1', title: 'Week 1' },
    service: 'content.createModule',
    expected: ['crs_1', 'Week 1', OWNER],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'rename_module',
    args: { courseId: 'crs_1', moduleId: 'mod_1', title: 'Week one' },
    service: 'content.updateModule',
    expected: ['crs_1', 'mod_1', 'Week one', OWNER],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'reorder_modules',
    args: { courseId: 'crs_1', orderedIds: ['mod_2', 'mod_1'] },
    service: 'content.reorderModules',
    expected: ['crs_1', ['mod_2', 'mod_1'], OWNER],
    returns: [{ id: 'mod_2' }, { id: 'mod_1' }],
  },
  {
    tool: 'delete_course',
    args: { courseId: 'crs_1' },
    service: 'content.deleteCourse',
    expected: ['crs_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'delete_module',
    args: { courseId: 'crs_1', moduleId: 'mod_1' },
    service: 'content.deleteModule',
    expected: ['crs_1', 'mod_1', OWNER],
    returns: [],
  },
];

describe('course tools', () => {
  it('declare their operation and hints', () => {
    expect(toolSpecs(courseTools)).toEqual([
      ['list_courses', 'content.listCourses', 'read', true, false],
      ['list_modules', 'content.listCourseModules', 'read', true, false],
      ['create_course', 'content.createCourse', 'write', false, false],
      ['update_course', 'content.updateCourse', 'write', true, false],
      ['update_course_settings', 'content.patchCourseSettings', 'write', true, false],
      ['create_module', 'content.createModule', 'write', false, false],
      ['rename_module', 'content.updateModule', 'write', true, false],
      ['reorder_modules', 'content.reorderModules', 'write', true, false],
      ['delete_course', 'content.deleteCourse', 'destructive', true, false],
      ['delete_module', 'content.deleteModule', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(courseTools, c));
});
