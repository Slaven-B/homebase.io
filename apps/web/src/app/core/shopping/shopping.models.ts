export interface UserRef {
  id: string;
  displayName: string;
}

export interface ShoppingListSummary {
  id: string;
  name: string;
  isArchived: boolean;
  openItems: number;
  totalItems: number;
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  quantity: string | null;
  category: string | null;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  addedBy: UserRef | null;
  completedBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListDetail {
  id: string;
  name: string;
  isArchived: boolean;
  createdBy: UserRef | null;
  createdAt: string;
  updatedAt: string;
  items: ShoppingItem[];
}

export interface ShoppingItemInput {
  name: string;
  quantity?: string | null;
  category?: string | null;
  notes?: string | null;
}

export type ShoppingItemPatch = Partial<ShoppingItemInput> & { completed?: boolean };
