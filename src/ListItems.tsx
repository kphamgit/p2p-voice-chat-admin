import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import GenericSortableTable, { RowDragHandleCell, type genericItemType } from './GenericSortableTable';
import { ItemFormModal } from './ItemFormModal';
import { type QuestionItem } from './item';

// The full item rides along on each row so Edit can prefill the form.
interface ItemDataRowProps extends genericItemType {
  item: QuestionItem;
}

// Load an item group's items (the backend orders them by number), mapped to the table's row shape.
async function fetchItems(itemGroupId: string, token: string | null): Promise<ItemDataRowProps[]> {
  const data = await apiFetch<QuestionItem[]>(`/item-groups/${itemGroupId}/question-items`, token);
  return data.map((item) => ({ itemId: String(item.id), item_number: item.itemNumber, item }));
}

// Show long text in a table cell on one line, cut off with an ellipsis; the full text is in the tooltip.
const truncatedCell = (text: string | null) => (
  <span className="block max-w-64 truncate" title={text ?? undefined}>
    {text}
  </span>
);

interface Props {
  // itemType ('text', 'question', or '' when unset) decides which fields the item form shows.
  itemGroup: { itemId: string; item_number: number; itemType: string };
  onBack: () => void;
}

// Lists one item group's items in a drag-sortable table. "Add Item" and each
// row's Edit button open ItemFormModal; delete and renumber write straight to the backend.
export default function ListItems({ itemGroup, onBack }: Props) {
  const { token } = useAuth();
  const [items, setItems] = useState<ItemDataRowProps[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Which item the form modal is open for: 'new', an existing item, or closed.
  const [formFor, setFormFor] = useState<QuestionItem | 'new' | null>(null);

  // Refetch after a write; the initial load happens in the effect below.
  const getItems = useCallback(async () => {
    try {
      setItems(await fetchItems(itemGroup.itemId, token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items.');
    }
  }, [itemGroup.itemId, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchItems(itemGroup.itemId, token);
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load items.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemGroup.itemId, token]);

  const deleteItem = async (row: ItemDataRowProps) => {
    if (!window.confirm(`Delete item ${row.item_number}?`)) {
      throw new Error('cancelled'); // keeps the row in the table
    }
    try {
      await apiFetch(`/question-items/${row.itemId}`, token, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item.');
      throw err;
    }
  };

  // The backend inserts the copy right after the source and shifts later item
  // numbers down, so refetch rather than patching the list locally.
  const cloneItem = async (row: ItemDataRowProps) => {
    try {
      await apiFetch(`/question-items/${row.itemId}/clone`, token, { method: 'POST' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone item.');
    }
    await getItems();
  };

  // The backend has no bulk renumber endpoint, so PUT each item whose number changed.
  const renumberItems = async (rows: ItemDataRowProps[]) => {
    const original = new Map(items.map((i) => [i.itemId, i.item_number]));
    const changed = rows.filter((row) => original.get(row.itemId) !== row.item_number);
    try {
      await Promise.all(
        changed.map((row) =>
          apiFetch(`/question-items/${row.itemId}`, token, { method: 'PUT', body: { itemNumber: row.item_number } }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to renumber items.');
    }
    await getItems();
  };

  const columns = useMemo<ColumnDef<ItemDataRowProps>[]>(
    () => [
      {
        id: 'drag-handle',
        header: '',
        cell: ({ row }) => <RowDragHandleCell rowId={row.id} />,
        size: 60,
      },
      { accessorKey: 'item_number', header: 'Item Number' },
      { id: 'questionText', header: 'Question Text', cell: ({ row }) => truncatedCell(row.original.item.questionText) },
      { id: 'answerKey', header: 'Answer Key', cell: ({ row }) => truncatedCell(row.original.item.answerKey) },
      { id: 'choices', header: 'Choices', cell: ({ row }) => truncatedCell(row.original.item.choices) },
      { accessorKey: 'itemId', header: 'Item ID' },
    ],
    [],
  );

  return (
    <div className="p-5 text-left">
      <button onClick={onBack} className="mb-2 text-blue-600 underline hover:opacity-80">
        ← Back to item groups
      </button>
      <h2 className="text-2xl">Items of item group {itemGroup.item_number}</h2>
      <p className="m-0">Item type: {itemGroup.itemType || 'not set'}</p>

      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        onClick={() => setFormFor('new')}
        className="my-3 rounded-lg bg-green-600 px-4 py-2 font-bold text-white hover:opacity-90"
      >
        Add Item
      </button>

      {items.length > 0 ? (
        <GenericSortableTable
          input_data={items}
          columns={columns}
          on_edit={(row) => setFormFor(row.item)}
          on_delete={deleteItem}
          on_clone={cloneItem}
          on_renumber={renumberItems}
        />
      ) : (
        <p>No items found.</p>
      )}

      {formFor && (
        <ItemFormModal
          // Remount per target so the form starts from that item's values.
          key={formFor === 'new' ? 'new' : formFor.id}
          itemGroupId={itemGroup.itemId}
          itemType={itemGroup.itemType}
          item={formFor === 'new' ? undefined : formFor}
          // A new item defaults to one past the current highest number.
          defaultItemNumber={items.reduce((max, i) => Math.max(max, i.item_number), 0) + 1}
          onSaved={() => {
            setFormFor(null);
            getItems();
          }}
          onClose={() => setFormFor(null)}
        />
      )}
    </div>
  );
}
