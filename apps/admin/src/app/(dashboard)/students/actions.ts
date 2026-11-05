"use server";

// Server actions for student mutations (list page + detail page).

import { revalidatePath } from "next/cache";
import { People } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export interface AddStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  /** Unchecked still creates the student and their invitation — it only
   *  suppresses delivery, so the admin can hand the link over another way. */
  sendEmail: boolean;
}

// Adding a student IS inviting one with the Member org role: the invite
// provisions the person and their org user up front, so the row exists here
// whether or not an email goes out.
export async function addStudentAction(input: AddStudentInput): Promise<void> {
  await People.createInvite(
    {
      email: input.email,
      roleKey: "member",
      firstName: input.firstName,
      lastName: input.lastName,
      sendEmail: input.sendEmail,
    },
    await authHeaders(),
  );
  revalidatePath("/students");
}
