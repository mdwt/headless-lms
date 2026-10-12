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
    scope: 'courses:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CoursesQuery,
    call: (input, { container, scope }) => container.content.listCourses(scope.orgId, input),
  }),
  defineTool({
    name: 'list_modules',
    title: 'List modules',
    description: 'The modules of a course, in order.',
    scope: 'courses:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, scope }) =>
      container.content.listCourseModules(scope.orgId, courseId),
  }),
  defineTool({
    name: 'create_course',
    title: 'Create course',
    description: 'Create a draft course. Publish it with update_course.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateCourse,
    call: (input, { container, scope }) => container.content.createCourse(scope.orgId, input),
  }),
  defineTool({
    name: 'update_course',
    title: 'Update course',
    description:
      'Change a course title, description, category or cover image, or publish and unpublish it with status. Fields left out stay as they are.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateCourse.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...patch }, { container, scope }) =>
      container.content.updateCourse(scope.orgId, courseId, patch),
  }),
  defineTool({
    name: 'update_course_settings',
    title: 'Update course settings',
    description:
      'Change course settings such as transcript downloads and comments. Settings left out stay as they are.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: PatchCourseSettings.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...settings }, { container, scope }) =>
      container.content.patchCourseSettings(scope.orgId, courseId, settings),
  }),
  defineTool({
    name: 'create_module',
    title: 'Create module',
    description: 'Add a module at the end of a course. Returns the course modules in order.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateModule.extend(CourseIdPathParam.shape),
    call: ({ courseId, title }, { container, scope }) =>
      container.content.createModule(scope.orgId, courseId, title),
  }),
  defineTool({
    name: 'rename_module',
    title: 'Rename module',
    description: 'Rename a module. Returns the course modules in order.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateModule.extend(ModulePathParam.shape),
    call: ({ courseId, moduleId, title }, { container, scope }) =>
      container.content.updateModule(scope.orgId, courseId, moduleId, title),
  }),
  defineTool({
    name: 'reorder_modules',
    title: 'Reorder modules',
    description:
      'Set the module order of a course. Pass every module id of the course in the new order.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ReorderInput.extend(CourseIdPathParam.shape),
    call: ({ courseId, orderedIds }, { container, scope }) =>
      container.content.reorderModules(scope.orgId, courseId, orderedIds),
  }),
  defineTool({
    name: 'delete_course',
    title: 'Delete course',
    description: 'Permanently delete a course with its modules and activities.',
    scope: 'courses:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, scope }) =>
      container.content.deleteCourse(scope.orgId, courseId),
  }),
  defineTool({
    name: 'delete_module',
    title: 'Delete module',
    description:
      'Permanently delete a module with its activities. Returns the remaining modules in order.',
    scope: 'courses:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: ModulePathParam,
    call: ({ courseId, moduleId }, { container, scope }) =>
      container.content.deleteModule(scope.orgId, courseId, moduleId),
  }),
];
