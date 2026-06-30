// courses context — domain entities & value objects. Framework-free.

export type CourseStatus = "draft" | "published";

export interface Course {
  readonly id: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  category: string;
  moduleCount: number;
  lessonCount: number;
  enrolledCount: number;
  updatedAt: string;
  createdAt: string;
}
