export type ActivityMetadata = Record<string, string | number | boolean | null>;

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: ActivityMetadata;
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityEntry[];
  nextCursor: string | null;
}
