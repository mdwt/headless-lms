"use client";

import { CategoryListEditor } from "@/components/notification-categories/category-list-editor";
import type { NotificationCategoryList, NotificationTypeInfo } from "@/lib/api/types";

import { replaceOrgCategoriesAction, resetOrgCategoriesAction } from "./actions";

export function OrgCategories({
  list,
  types,
  channels,
}: {
  list: NotificationCategoryList;
  types: NotificationTypeInfo[];
  channels: string[];
}) {
  return (
    <CategoryListEditor
      scope="org"
      list={list}
      types={types}
      channels={channels}
      spaces={null}
      save={replaceOrgCategoriesAction}
      reset={resetOrgCategoriesAction}
    />
  );
}
