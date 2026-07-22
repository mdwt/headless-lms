// Dashboard / overview resource schemas.
import { z } from "zod";

export const OverviewStats = z.object({
  publishedCourses: z.number().int(),
  draftCourses: z.number().int(),
  activeStudents: z.number().int(),
  activeEntitlements: z.number().int(),
  expiringSoon: z.number().int(),
});
export type OverviewStats = z.infer<typeof OverviewStats>;
