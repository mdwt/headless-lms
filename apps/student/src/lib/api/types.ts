import type {
  GetLearnCourseResponse,
  ListLearnCoursesResponse,
  ListLearnModulesResponse,
} from "@headless-lms/sdk";

export type Course = GetLearnCourseResponse;
export type CourseSummary = ListLearnCoursesResponse[number];
export type Module = ListLearnModulesResponse[number];
export type Activity = Module["activities"][number];

/** The editor-agnostic content wrapper stored under `settings.content`. */
export interface ActivityContent {
  config: unknown;
  type: string;
  version?: number;
}
export interface ActivitySettings {
  title?: string;
  published?: boolean;
  content?: ActivityContent;
}
