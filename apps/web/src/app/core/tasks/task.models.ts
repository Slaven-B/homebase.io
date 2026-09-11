export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface Task {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: Priority;
  status: TaskStatus;
  assignee: UserRef | null;
  createdBy: UserRef | null;
  commentCount: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  content: string;
  author: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Task {
  comments: TaskComment[];
}

export interface TaskInput {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueAt?: string | null;
  priority?: Priority;
}

export type TaskPatch = Partial<TaskInput> & { status?: TaskStatus };

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
};
