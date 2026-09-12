import { NotificationType } from '@prisma/client';

export interface NotificationView {
  id: string;
  householdId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, string | number | boolean | null>;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  items: NotificationView[];
  nextCursor: string | null;
}
