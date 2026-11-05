// automations context — ports. AutomationDispatch/Executor/Engine and the
// WebhookSender contract are owned by @headless-lms/core/types and re-exported
// here so every adapter implementation shares one definition.
import type {
  Automation,
  AutomationKind,
  AutomationRun,
  CreatedWebhook,
  Page,
  Webhook,
  WebhookSecret,
} from './model.js';
import type {
  AutomationRunsQuery,
  AutomationsQuery,
  AvailableActions,
  AvailableTriggers,
  CreateAutomationInput,
  CreateWebhookInput,
  UpdateAutomationInput,
  UpdateWebhookInput,
} from './types.js';
import type { CredentialStore, DomainEvent, OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type {
  Delivery,
  NotificationCategory,
  NotificationFilter,
  RecipientList,
  ScheduledAutomation,
  StoredNotification,
  SubjectRef,
} from '../types/index.js';
import type { CommunityMailReads } from './community-mail.js';
import type { Actor } from '../shared/actor.js';

export type {
  AutomationDispatch,
  AutomationExecutor,
  AutomationEngine,
  DeliveryDispatch,
  WebhookRequest,
  WebhookResponse,
  WebhookSender,
} from '../types/index.js';

export type NewAutomation = CreateAutomationInput & {
  kind: AutomationKind;
};

export interface NotificationCategories {
  listFor(orgId: string, communityId: string | null): Promise<NotificationCategory[]>;
}

export interface NotificationReads extends Omit<CommunityMailReads, 'recentMessageRecipients'> {
  threadParticipants(orgId: string, item: SubjectRef): Promise<string[]>;
  mutedAmong(orgId: string, item: SubjectRef, orgUserIds: string[], at: Date): Promise<string[]>;
  communityMembers(orgId: string, communityId: string): Promise<string[]>;
  switchedOn(
    orgId: string,
    communityId: string,
    category: string,
    spaceId: string | null,
  ): Promise<string[]>;
  courseHolders(orgId: string, courseId: string): Promise<string[]>;
  contentLostBy(
    orgId: string,
    grant: { orgUserId: string; contentId: string | null; bundleId: string | null },
  ): Promise<string[]>;
  activity(
    orgId: string,
    activityId: string,
  ): Promise<{ title: string; moduleTitle: string; courseId: string; courseTitle: string } | null>;
  userIdsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, string>>;
  emailOf(orgId: string, userId: string): Promise<string | null>;
  message(
    orgId: string,
    messageId: string,
  ): Promise<{ orgUserId: string; chatId: string; body: string } | null>;
  postsPublished(
    orgId: string,
    communityId: string,
    from: Date,
    to: Date,
  ): Promise<
    {
      postId: string;
      spaceId: string;
      title: string;
      authorName: string;
      spaceName: string;
      commentCount: number;
    }[]
  >;
  unreadInChat(
    orgId: string,
    chatId: string,
    orgUserId: string,
  ): Promise<{
    count: number;
    latest: { messageId: string; senderOrgUserId: string; body: string } | null;
  }>;
}

export type RecipientRule = (
  event: DomainEvent,
  reads: NotificationReads,
) => Promise<RecipientList[]>;

export interface ChatDebounce {
  arm(orgId: string, list: RecipientList, occurredAt: Date): Promise<void>;
  mentioned(orgId: string, userId: string, chatId: string): Promise<void>;
}

export interface NewNotification extends Omit<StoredNotification, 'orgId'> {
  sourceEventId: string | null;
  inApp: boolean;
}

export interface NewDelivery {
  id: string;
  notificationId: string;
  channel: string;
}

export type ListedNotification = StoredNotification & { readAt: Date | null };

export interface NotificationPage {
  items: ListedNotification[];
  total: number;
  unreadCount: number;
}

export interface UnreadCounts {
  org: number;
  communities: { communityId: string; unread: number }[];
}

export interface NotificationsService {
  list(
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<NotificationPage>;
  get(userId: string, notificationId: string, actor: Actor): Promise<ListedNotification | null>;
  unreadCounts(userId: string, communityIds: string[], actor: Actor): Promise<UnreadCounts>;
  markRead(userId: string, notificationId: string, actor: Actor): Promise<void>;
  markAllRead(
    userId: string,
    filter: NotificationFilter,
    actor: Actor,
  ): Promise<{ marked: number }>;
}

export interface NotificationsRepository {
  insert(orgId: string, rows: NewNotification[], deliveries: NewDelivery[]): Promise<void>;
  pendingDeliveriesForEvent(orgId: string, sourceEventId: string): Promise<{ id: string }[]>;
  findDelivery(
    orgId: string,
    deliveryId: string,
  ): Promise<{ delivery: Delivery; notification: StoredNotification } | null>;
  markSent(orgId: string, deliveryId: string, at: Date): Promise<void>;
  recordError(orgId: string, deliveryId: string, error: string): Promise<void>;
  markFailed(orgId: string, deliveryId: string, error: string): Promise<void>;
  page(
    orgId: string,
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
  ): Promise<NotificationPage>;
  find(orgId: string, userId: string, notificationId: string): Promise<ListedNotification | null>;
  unreadCounts(orgId: string, userId: string, communityIds: string[]): Promise<UnreadCounts>;
  markRead(orgId: string, userId: string, notificationId: string, at: Date): Promise<boolean>;
  markAllRead(orgId: string, userId: string, filter: NotificationFilter, at: Date): Promise<number>;
}

/** A run row before persistence assigns its id and event_id. */
export type NewAutomationRun = Omit<AutomationRun, 'id' | 'eventId'>;

// Inbound port (use cases the service exposes).
export interface AutomationsService {
  /** Dispatches a run per enabled automation the event matches, then runs the notification process; throws only when the notification process fails, so the outbox redelivers. */
  handle(event: DomainEvent): Promise<void>;
  /** Built-in action types plus every loaded integration's declared actions. */
  availableActions(actor: Actor): AvailableActions;
  /** The domain event types an automation may react to. */
  availableTriggers(actor: Actor): AvailableTriggers;
  list(query: AutomationsQuery | undefined, actor: Actor): Promise<Automation[]>;
  get(id: string, actor: Actor): Promise<Automation | null>;
  create(input: CreateAutomationInput, actor: Actor): Promise<Automation>;
  update(id: string, input: UpdateAutomationInput, actor: Actor): Promise<Automation | null>;
  delete(id: string, actor: Actor): Promise<boolean>;
  listRuns(
    automationId: string,
    query: AutomationRunsQuery,
    actor: Actor,
  ): Promise<Page<AutomationRun>>;
  rerun(automationId: string, runId: string, actor: Actor): Promise<AutomationRun>;
  listWebhooks(actor: Actor): Promise<Webhook[]>;
  getWebhook(id: string, actor: Actor): Promise<Webhook | null>;
  createWebhook(input: CreateWebhookInput, actor: Actor): Promise<CreatedWebhook>;
  updateWebhook(id: string, input: UpdateWebhookInput, actor: Actor): Promise<Webhook | null>;
  deleteWebhook(id: string, actor: Actor): Promise<boolean>;
  revealWebhookSecret(id: string, actor: Actor): Promise<WebhookSecret | null>;
  rotateWebhookSecret(id: string, actor: Actor): Promise<WebhookSecret | null>;
}

// Outbound ports (persistence contracts the repositories fulfil).
export interface AutomationsRepository {
  insert(orgId: string, input: NewAutomation): Promise<Automation>;
  update(orgId: string, id: string, patch: UpdateAutomationInput): Promise<Automation | null>;
  /** Returns the deleted row (the event snapshot), or null if it didn't exist. */
  delete(orgId: string, id: string): Promise<Automation | null>;
  findById(orgId: string, id: string): Promise<Automation | null>;
  listByOrg(orgId: string, kind?: AutomationKind): Promise<Automation[]>;
  /** All rows whose triggers include `trigger`, enabled and disabled alike — the service filters to `enabled`. */
  listByTrigger(orgId: string, trigger: string): Promise<Automation[]>;
  listSchedules(): Promise<ScheduledAutomation[]>;
}

export interface AutomationRunsRepository {
  /** Keyed by (orgId, automationId, event.id); returns `null` if this event was already run for this automation (duplicate). */
  insert(orgId: string, run: NewAutomationRun): Promise<AutomationRun | null>;
  findById(orgId: string, id: string): Promise<AutomationRun | null>;
  /** Puts a finished run back to running with no results; `null` if it's missing or still running. */
  restart(orgId: string, id: string, startedAt: Date): Promise<AutomationRun | null>;
  recordOutcome(
    orgId: string,
    id: string,
    outcome: {
      status: AutomationRun['status'];
      actionResults: AutomationRun['actionResults'];
      finishedAt: Date;
    },
  ): Promise<AutomationRun | null>;
  list(
    orgId: string,
    automationId: string,
    query: AutomationRunsQuery,
  ): Promise<Page<AutomationRun>>;
  recentRecipients(
    orgId: string,
    automationId: string,
    chatId: string,
    since: Date,
  ): Promise<string[]>;
}

/** Tx-scoped port bundle for this context's mutating use cases — every member
 *  is bound to the UnitOfWork's transaction, so the write(s) and the event
 *  append commit or roll back as one. */
export interface AutomationsTxScope {
  automations: AutomationsRepository;
  runs: AutomationRunsRepository;
  credentials: CredentialStore;
  outbox: OutboxAppender;
}

export type AutomationsUnitOfWork = UnitOfWork<AutomationsTxScope>;
