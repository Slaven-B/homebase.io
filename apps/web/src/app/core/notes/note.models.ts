import { UserRef } from '../tasks/task.models';

export interface Note {
  id: string;
  householdId: string;
  title: string;
  content: string;
  isPinned: boolean;
  author: UserRef | null;
  lastEditedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteSummary extends Omit<Note, 'content'> {
  preview: string;
}

export interface NoteInput {
  title: string;
  content?: string;
  isPinned?: boolean;
}

export type NotePatch = Partial<NoteInput>;
