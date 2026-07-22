// Students resource schemas.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const Student = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable().optional(),
  entitlementCount: z.number().int(),
  /** 0–100, averaged across active entitlements. */
  avgProgress: z.number().int(),
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable(),
});
export type Student = z.infer<typeof Student>;

export const StudentsQuery = ListQuery;
export type StudentsQuery = z.infer<typeof StudentsQuery>;

export const StudentsPage = paginated(Student);
export type StudentsPage = z.infer<typeof StudentsPage>;

export const StudentIdParam = z.object({ id: z.string() });
export type StudentIdParam = z.infer<typeof StudentIdParam>;
