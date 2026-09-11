import { Priority, TaskStatus } from '@prisma/client';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface TaskView {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  /** YYYY-MM-DD or null. */
  dueAt: string | null;
  priority: Priority;
  status: TaskStatus;
  assignee: UserRef | null;
  createdBy: UserRef | null;
  commentCount: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskCommentView {
  id: string;
  content: string;
  author: UserRef | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDetail extends TaskView {
  comments: TaskCommentView[];
}
