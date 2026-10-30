import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { SpaceBasicsForm } from "./_components/space-basics-form";
import { SpaceAccessForm } from "./_components/space-access-form";
import { PostRules } from "./_components/post-rules";
import { TopicsEditor } from "./_components/topics-editor";
import { LinksEditor } from "./_components/links-editor";

export default async function SpaceSettingsTab({
  params,
}: {
  params: Promise<{ communityId: string; spaceId: string }>;
}) {
  const { communityId, spaceId } = await params;
  const spacePromise = serverApi.getSpace(communityId, spaceId);
  const contentPromise = serverApi.linkableContent();
  await requireManager(spacePromise, contentPromise);
  const [space, content] = await Promise.all([spacePromise, contentPromise]);
  const links = await serverApi.spaceLinks(space);

  return (
    <SettingsSurface>
      <SpaceBasicsForm communityId={communityId} space={space} />
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
