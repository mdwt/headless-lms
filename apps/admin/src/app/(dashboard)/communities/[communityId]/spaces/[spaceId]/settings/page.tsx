import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { SpaceBasicsForm } from "./_components/space-basics-form";
import { SpaceAccessForm } from "./_components/space-access-form";
import { SpaceImages } from "./_components/space-images";
import { PostRules } from "./_components/post-rules";
import { TopicsEditor } from "./_components/topics-editor";
import { LinksEditor } from "./_components/links-editor";

export default async function SpaceSettingsTab({
  params,
}: {
  params: Promise<{ communityId: string; spaceId: string }>;
}) {
  const { communityId, spaceId } = await params;
  await requirePermission("communities:write", communityId);
  const [space, content] = await Promise.all([
    serverApi.getSpace(communityId, spaceId),
    serverApi.linkableContent(),
  ]);
  const links = await serverApi.spaceLinks(space);

  return (
    <SettingsSurface>
      <SpaceBasicsForm communityId={communityId} space={space} />
      <SpaceImages communityId={communityId} space={space} />
      <SpaceAccessForm communityId={communityId} space={space} />
      <PostRules communityId={communityId} spaceId={space.id} settings={space.settings} />
      <TopicsEditor communityId={communityId} spaceId={space.id} topics={space.topics} />
      <LinksEditor
        communityId={communityId}
        spaceId={space.id}
        links={links}
        content={content.filter((c) => c.id !== communityId)}
      />
    </SettingsSurface>
  );
}
