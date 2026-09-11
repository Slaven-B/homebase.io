export interface ShoppingListSummary {
  id: string;
  name: string;
  isArchived: boolean;
  openItems: number;
  totalItems: number;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ShoppingItemView {
  id: string;
  listId: string;
  name: string;
  quantity: string | null;
  category: string | null;
  notes: string | null;
  completed: boolean;
  completedAt: Date | null;
  addedBy: { id: string; displayName: string } | null;
  completedBy: { id: string; displayName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShoppingListDetail extends Omit<ShoppingListSummary, 'openItems' | 'totalItems'> {
  items: ShoppingItemView[];
}
