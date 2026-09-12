export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'CHORE_ASSIGNED'
  | 'CHORE_DUE'
  | 'BILL_DUE'
  | 'INVITATION'
  | 'EXPENSE_SHARED'
  | 'SETTLEMENT_RECEIVED'
  | 'GENERIC';

export interface AppNotification {
  id: string;
  householdId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, string | number | boolean | null>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  TASK_ASSIGNED: 'task_alt',
  CHORE_ASSIGNED: 'cleaning_services',
  CHORE_DUE: 'event_available',
  BILL_DUE: 'receipt',
  INVITATION: 'mail',
  EXPENSE_SHARED: 'receipt_long',
  SETTLEMENT_RECEIVED: 'handshake',
  GENERIC: 'notifications',
};
