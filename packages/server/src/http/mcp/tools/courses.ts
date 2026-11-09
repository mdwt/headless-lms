import {
  CourseIdPathParam,
  CoursesQuery,
  CreateCourse,
  CreateModule,
  ModulePathParam,
  PatchCourseSettings,
  ReorderInput,
  UpdateCourse,
  UpdateModule,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const courseTools: Tool[] = [
  defineTool({
    name: 'list_courses',
    title: 'List courses',
    description:
      'Search and page through the courses, each with its status and settings. Filter by status or category.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CoursesQuery,
    call: (input, { container, caller }) => container.content.listCourses(input, caller.actor),
  }),
  defineTool({
    name: 'list_modules',
    title: 'List modules',
    description: 'The modules of a course, in order.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, caller }) =>
      container.content.listCourseModules(courseId, caller.actor),
  }),
  defineTool({
    name: 'create_course',
    title: 'Create course',
    description: 'Create a draft course. Publish it with update_course.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateCourse,
    call: (input, { container, caller }) => container.content.createCourse(input, caller.actor),
  }),
  defineTool({
    name: 'update_course',
    title: 'Update course',
    description:
      'Change a course title, description, category or cover image, or publish and unpublish it with status. Fields left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateCourse.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...patch }, { container, caller }) =>
      container.content.updateCourse(courseId, patch, caller.actor),
  }),
  defineTool({
    name: 'update_course_settings',
    title: 'Update course settings',
    description:
      'Change course settings such as transcript downloads and comments. Settings left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: PatchCourseSettings.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...settings }, { container, caller }) =>
      container.content.patchCourseSettings(courseId, settings, caller.actor),
  }),
  defineTool({
    name: 'create_module',
    title: 'Create module',
    description: 'Add a module at the end of a course. Returns the course modules in order.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateModule.extend(CourseIdPathParam.shape),
    call: ({ courseId, title }, { container, caller }) =>
      container.content.createModule(courseId, title, caller.actor),
  }),
  defineTool({
    name: 'rename_module',
    title: 'Rename module',
    description: 'Rename a module. Returns the course modules in order.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateModule.extend(ModulePathParam.shape),
    call: ({ courseId, moduleId, title }, { container, caller }) =>
      container.content.updateModule(courseId, moduleId, title, caller.actor),
  }),
  defineTool({
    name: 'reorder_modules',
    title: 'Reorder modules',
    description:
      'Set the module order of a course. Pass every module id of the course in the new order.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ReorderInput.extend(CourseIdPathParam.shape),
    call: ({ courseId, orderedIds }, { container, caller }) =>
      container.content.reorderModules(courseId, orderedIds, caller.actor),
  }),
  defineTool({
    name: 'delete_course',
    title: 'Delete course',
    description: 'Permanently delete a course with its modules and activities.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, caller }) =>
      container.content.deleteCourse(courseId, caller.actor),
  }),
  defineTool({
    name: 'delete_module',
    title: 'Delete module',
    description:
      'Permanently delete a module with its activities. Returns the remaining modules in order.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: ModulePathParam,
    call: ({ courseId, moduleId }, { container, caller }) =>
      container.content.deleteModule(courseId, moduleId, caller.actor),
  }),
];
