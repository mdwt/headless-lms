"use server";

// Server actions for student mutations (list page + detail page).

import { revalidatePath } from "next/cache";
import { Invites, Students } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import type { Student } from "@/lib/api/types";

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  sendInvite: boolean;
}

export async function createStudentAction(input: CreateStudentInput): Promise<Student> {
  ensureConfigured();
  const { sendInvite, ...body } = input;
  const student = unwrap(await Students.createStudent({ body, ...(await authHeaders()) }));
  if (sendInvite) {
    unwrap(
      await Invites.createInvite({
        body: { email: student.email, role: "student" },
        ...(await authHeaders()),
      }),
    );
  }
  revalidatePath("/students");
  return student;
}

export async function resendStudentInviteAction(email: string): Promise<void> {
  ensureConfigured();
  unwrap(
    await Invites.createInvite({
      body: { email, role: "student" },
      ...(await authHeaders()),
    }),
  );
}
