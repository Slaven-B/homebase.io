/**
 * Stable action identifiers. New modules add their own ("shopping.item_added", ...).
 * The frontend maps these to sentences; the API never stores rendered text.
 */
export const ActivityAction = {
  HouseholdCreated: 'household.created',
  HouseholdRenamed: 'household.renamed',
  MemberJoined: 'member.joined',
  MemberLeft: 'member.left',
  MemberRemoved: 'member.removed',
  MemberRoleChanged: 'member.role_changed',
  InvitationSent: 'invitation.sent',
  ShoppingListCreated: 'shopping.list_created',
  ShoppingItemAdded: 'shopping.item_added',
  ShoppingItemCompleted: 'shopping.item_completed',
} as const;

export type ActivityActionType = (typeof ActivityAction)[keyof typeof ActivityAction];

export const ActivityEntity = {
  Household: 'household',
  Member: 'member',
  Invitation: 'invitation',
  ShoppingList: 'shopping_list',
  ShoppingItem: 'shopping_item',
} as const;

export type ActivityEntityType = (typeof ActivityEntity)[keyof typeof ActivityEntity];

export type ActivityMetadata = Record<string, string | number | boolean | null>;

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: ActivityMetadata;
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdAt: Date;
}

export interface ActivityPage {
  items: ActivityEntry[];
  /** Pass back as `cursor` to fetch older entries; null when exhausted. */
  nextCursor: string | null;
}
