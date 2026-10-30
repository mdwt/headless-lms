import { z } from "zod";

export const capacitySchema = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1), "Enter a whole number of people");

export function parseCapacity(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}
