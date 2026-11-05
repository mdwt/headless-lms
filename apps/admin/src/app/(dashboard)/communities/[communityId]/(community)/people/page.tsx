import { ItemRolesSection } from "@/components/item-roles-section";

export default async function CommunityPeopleTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  return (
    <ItemRolesSection contentId={communityId} contentType="community" contentNoun="community" />
  );
}
