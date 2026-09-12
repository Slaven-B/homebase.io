export interface UserRef {
  id: string;
  displayName: string;
}

export interface NoteView {
  id: string;
  householdId: string;
  title: string;
  content: string;
  isPinned: boolean;
  author: UserRef | null;
  lastEditedBy: UserRef | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteSummary extends Omit<NoteView, 'content'> {
  preview: string;
}
