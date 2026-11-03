import { isStaffRole } from '../organizations/index.js';
import type { Actor } from '../shared/actor.js';
import type { Activity, SubjectRef } from '../types/index.js';
import type {
  BundlesService,
  ContentService,
  ItemTitle,
  ItemTitleAccess,
  ItemTitles,
} from './ports.js';

export function activityTitle(activity: Pick<Activity, 'settings'>): string {
  const title = (activity.settings as { title?: unknown } | null)?.title;
  return typeof title === 'string' ? title : '';
}

function isPublishedActivity(activity: Pick<Activity, 'settings'>): boolean {
  return (activity.settings as { published?: boolean } | null)?.published !== false;
}

type TitleReads = Pick<
  ContentService,
  'getCourse' | 'getActivity' | 'getDownload' | 'getSpace' | 'getCommunity'
> &
  Pick<BundlesService, 'getBundle' | 'listBundleItems'>;

export class ContentItemTitles implements ItemTitles {
  constructor(
    private readonly deps: {
      content: TitleReads;
      access: ItemTitleAccess;
    },
  ) {}

  async titlesFor(
    orgId: string,
    actor: Actor,
    refs: SubjectRef[],
  ): Promise<Record<string, ItemTitle>> {
    const unique = new Map(refs.map((ref) => [`${ref.type}:${ref.id}`, ref]));
    const entries = await Promise.all(
      [...unique].map(async ([key, ref]): Promise<[string, ItemTitle] | null> => {
        const title = await this.titleOf(orgId, actor, ref);
        return title === null ? null : [key, { title }];
      }),
    );
    return Object.fromEntries(
      entries.filter((entry): entry is [string, ItemTitle] => entry !== null),
    );
  }

  private async titleOf(orgId: string, actor: Actor, ref: SubjectRef): Promise<string | null> {
    const staff = isStaffRole(actor.role);
    switch (ref.type) {
      case 'course': {
        const course = await this.deps.content.getCourse(orgId, ref.id);
        return course && (staff || (await this.opensCourse(orgId, actor, course)))
          ? course.title
          : null;
      }
      case 'activity': {
        const activity = await this.deps.content.getActivity(orgId, ref.id);
        if (!activity) {
          return null;
        }
        if (staff) {
          return activityTitle(activity);
        }
        const course = await this.deps.content.getCourse(orgId, activity.courseId);
        return course &&
          isPublishedActivity(activity) &&
          (await this.opensCourse(orgId, actor, course))
          ? activityTitle(activity)
          : null;
      }
      case 'download': {
        const download = await this.deps.content.getDownload(orgId, ref.id);
        if (!download) {
          return null;
        }
        return staff ||
          (download.status === 'published' &&
            (await this.deps.access.hasAccess(orgId, actor.id, download.id)))
          ? download.title
          : null;
      }
      case 'bundle': {
        const bundle = await this.deps.content.getBundle(orgId, ref.id);
        if (!bundle) {
          return null;
        }
        return staff || (await this.holdsBundle(orgId, actor, ref.id)) ? bundle.name : null;
      }
      case 'community': {
        const community = await this.deps.content.getCommunity(orgId, ref.id);
        return community && (await this.deps.access.isCommunityMember(orgId, actor, ref.id))
          ? community.title
          : null;
      }
      case 'space': {
        const space = await this.deps.content.getSpace(orgId, ref.id);
        return space && (await this.deps.access.canOpenSpace(orgId, actor, ref.id))
          ? space.name
          : null;
      }
      default:
        return null;
    }
  }

  private async opensCourse(
    orgId: string,
    actor: Actor,
    course: { id: string; status: string },
  ): Promise<boolean> {
    return course.status === 'published' && this.deps.access.hasAccess(orgId, actor.id, course.id);
  }

  private async holdsBundle(orgId: string, actor: Actor, bundleId: string): Promise<boolean> {
    const items = await this.deps.content.listBundleItems(orgId, bundleId);
    const held = await Promise.all(
      items.map((item) => this.deps.access.hasAccess(orgId, actor.id, item.contentId)),
    );
    return held.some(Boolean);
  }
}
