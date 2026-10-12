export async function needsOrgChoice(
  activeOrgId: string | null,
  memberOrgIds: () => Promise<readonly string[]>,
): Promise<boolean> {
  if (activeOrgId === null) {
    return true;
  }
  return !(await memberOrgIds()).includes(activeOrgId);
}
