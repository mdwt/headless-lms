import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, ownerAc, memberAc } from "better-auth/plugins/organization/access";

export const statement = { ...defaultStatements } as const;

const ac = createAccessControl(statement);

export const OWNER_MEMBERSHIP = "owner";
export const PARTICIPANT_MEMBERSHIP = "participant";

export const roles = {
  [OWNER_MEMBERSHIP]: ac.newRole(ownerAc.statements),
  [PARTICIPANT_MEMBERSHIP]: ac.newRole(memberAc.statements),
};

export { ac };
