"use server";

// Server actions for student mutations (list page + detail page).

import { revalidatePath } from "next/cache";
import { Students } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Student } from "@/lib/api/types";

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  sendInvite: boolean;
}

export async function createStudentAction(input: CreateStudentInput): Promise<Student> {
  ensureConfigured();
  const student = unwrap(
    await Students.createStudent({ body: input, ...(await authHeaders()) }),
  );
  revalidatePath("/students");
  return student;
}

export async function resendStudentInviteAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(
    await Students.resendStudentInvite({ path: { id }, ...(await authHeaders()) }),
  );
  revalidatePath(`/students/${id}`);
}
