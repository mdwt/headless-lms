import { sql } from "drizzle-orm";

export const insertedRow = sql<boolean>`(xmax = 0)`;
