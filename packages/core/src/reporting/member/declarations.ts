import type { Declarations } from '../../shared/declarations.js';
import type { MemberReportService } from './ports.js';

export const memberReportDeclarations = {
  viewer: 'member',
  listCourses: 'member',
  getCourse: 'member',
  listModules: 'member',
  listActivities: 'member',
  courseProgress: 'member',
  listDownloads: 'member',
  getDownload: 'member',
  thumbnailFile: 'member',
  activityFile: 'member',
  downloadFile: 'member',
  personImage: 'member',
  directory: 'member',
  communityHome: 'member',
  communitySpace: 'member',
  notifications: 'member',
  notification: 'member',
  notificationUnreadCounts: 'member',
  communityNotificationSettings: 'member',
  orgNotificationSettings: 'member',
} as const satisfies Declarations<MemberReportService>;
