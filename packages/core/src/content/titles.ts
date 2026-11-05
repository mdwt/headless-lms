import type { Actor } from '../shared/actor.js';
import type { Activity, SubjectRef } from '../types/index.js';
import type { ContentService, ItemTitle, ItemTitleAccess, ItemTitles } from './ports.js';

export function activityTitle(activity: Pick<Activity, 'settings'>): string {
  const title = (activity.settings as { title?: unknown } | null)?.title;
  return typeof title === 'string' ? title : '';
}

function isPublishedActivity(activity: Pick<Activity, 'settings'>): boolean {
  return (activity.settings as { published?: boolean } | null)?.published !== false;
}

type TitleReads = Pick<
  ContentService,
  'getCourse' | 'getActivity' | 'getDownload' | 'getSpace' | 'getCommunity' | 'getBundle'
> &
  Pick<ContentService, 'listBundleItems'>;

export class ContentItemTitles implements ItemTitles {
  constructor(
    private readonly deps: {
      content: TitleReads;
      access: ItemTitleAccess;
      organizations: { systemActor(orgId: string): Actor };
    },
  ) {}

  async titlesFor(refs: SubjectRef[], actor: Actor): Promise<Record<string, ItemTitle>> {
    const system = this.deps.organizations.systemActor(actor.orgId);
    const unique = new Map(refs.map((ref) => [`${ref.type}:${ref.id}`, ref]));
    const entries = await Promise.all(
      [...unique].map(async ([key, ref]): Promise<[string, ItemTitle] | null> => {
        const title = await this.titleOf(actor, system, ref);
        return title === null ? null : [key, { title }];
      }),
    );
    return Object.fromEntries(
      entries.filter((entry): entry is [string, ItemTitle] => entry !== null),
    );
  }

  private async titleOf(actor: Actor, system: Actor, ref: SubjectRef): Promise<string | null> {
    const can = actor.permissions;
    switch (ref.type) {
      case 'course': {
        const course = await this.deps.content.getCourse(ref.id, system);
        return course &&
          (can.has('courses:read', course.id) || (await this.opensCourse(actor, course)))
          ? course.title
          : null;
      }
      case 'activity': {
        const activity = await this.deps.content.getActivity(ref.id, system);
        if (!activity) {
          return null;
        }
        if (can.has('courses:read', activity.courseId)) {
          return activityTitle(activity);
        }
        const course = await this.deps.content.getCourse(activity.courseId, system);
        return course && isPublishedActivity(activity) && (await this.opensCourse(actor, course))
          ? activityTitle(activity)
          : null;
      }
      case 'download': {
        const download = await this.deps.content.getDownload(ref.id, system);
        if (!download) {
          return null;
        }
        return can.has('downloads:read', download.id) ||
          (download.status === 'published' &&
            (await this.deps.access.hasAccess(actor.orgId, actor.id, download.id)))
          ? download.title
          : null;
      }
      case 'bundle': {
        const bundle = await this.deps.content.getBundle(ref.id, system);
        if (!bundle) {
          return null;
        }
        return can.has('bundles:read') || (await this.holdsBundle(actor, system, ref.id))
          ? bundle.name
          : null;
      }
      case 'community': {
        const community = await this.deps.content.getCommunity(ref.id, system);
        return community && (await this.deps.access.isCommunityMember(ref.id, actor))
          ? community.title
          : null;
      }
      case 'space': {
        const space = await this.deps.content.getSpace(ref.id, system);
        return space && (await this.deps.access.canOpenSpace(ref.id, actor)) ? space.name : null;
      }
      default:
        return null;
    }
  }

  private async opensCourse(
    actor: Actor,
    course: { id: string; status: string },
  ): Promise<boolean> {
    return (
      course.status === 'published' && this.deps.access.hasAccess(actor.orgId, actor.id, course.id)
    );
  }

  private async holdsBundle(actor: Actor, system: Actor, bundleId: string): Promise<boolean> {
    const items = await this.deps.content.listBundleItems(bundleId, system);
    const held = await Promise.all(
      items.map((item) => this.deps.access.hasAccess(actor.orgId, actor.id, item.contentId)),
    );
    return held.some(Boolean);
  }
}
