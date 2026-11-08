import { ItemRolesSection } from "@/components/item-roles-section";

export default async function EventPeopleTab({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <ItemRolesSection contentId={eventId} contentType="event" contentNoun="event" />;
}
