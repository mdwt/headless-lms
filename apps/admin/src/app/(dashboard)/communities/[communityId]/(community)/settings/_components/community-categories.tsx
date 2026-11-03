"use client";

import { CategoryListEditor } from "@/components/notification-categories/category-list-editor";
import type { CategorySpace } from "@/components/notification-categories/category-dialog";
import type { NotificationCategoryList, NotificationTypeInfo } from "@/lib/api/types";

import {
  replaceCommunityCategoriesAction,
  resetCommunityCategoriesAction,
} from "../../../../actions";

export function CommunityCategories({
  communityId,
  list,
  types,
  channels,
  spaces,
}: {
  communityId: string;
  list: NotificationCategoryList;
  types: NotificationTypeInfo[];
  channels: string[];
  spaces: CategorySpace[];
}) {
  return (
    <CategoryListEditor
      scope="community"
      list={list}
      types={types}
      channels={channels}
      spaces={spaces}
      save={(categories) => replaceCommunityCategoriesAction(communityId, categories)}
      reset={() => resetCommunityCategoriesAction(communityId)}
    />
  );
}
