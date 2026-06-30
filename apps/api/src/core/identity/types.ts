// identity context — DTOs and use-case inputs/outputs.

export type UserId = string;
export type StudentId = string;

export interface RegisterUserInput {
  externalId: string;
  email: string;
  displayName: string;
}

export interface RegisterStudentInput {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
}
