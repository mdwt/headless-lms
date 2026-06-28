// identity context — DTOs and use-case inputs/outputs.

export type StudentId = string;

export interface RegisterStudentInput {
  authUserId: string;
  email: string;
  displayName: string;
}
