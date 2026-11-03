import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { OrgCategories } from "./org-categories";

export default async function NotificationSettingsPage() {
  const listPromise = serverApi.orgNotificationCategories();
  const typesPromise = serverApi.notificationTypes("org");
  const channelsPromise = serverApi.notificationChannels();
  await requireManager(listPromise, typesPromise, channelsPromise);
  const [list, types, channels] = await Promise.all([listPromise, typesPromise, channelsPromise]);

  return (
    <SettingsSurface>
      <OrgCategories list={list} types={types} channels={channels} />
    </SettingsSurface>
  );
}
