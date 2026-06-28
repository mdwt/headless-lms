// team context — ports.
import type { InviteMemberInput, Member, MembersQuery, Page, Role } from "./model.js";

export interface TeamService {
  list(query: MembersQuery): Promise<Page<Member>>;
  invite(input: InviteMemberInput): Promise<Member>;
  updateRole(id: string, role: Role): Promise<Member | null>;
  remove(id: string): Promise<boolean>;
}

export interface TeamRepository {
  list(query: MembersQuery): Promise<Page<Member>>;
  findByEmail(email: string): Promise<Member | null>;
  findById(id: string): Promise<Member | null>;
  insertInvite(input: InviteMemberInput): Promise<Member>;
  updateRole(id: string, role: Role): Promise<Member | null>;
  delete(id: string): Promise<boolean>;
}
