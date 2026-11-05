import { ItemRolesSection } from "@/components/item-roles-section";

export default async function DownloadPeopleTab({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;
  return <ItemRolesSection contentId={downloadId} contentType="download" contentNoun="download" />;
}
