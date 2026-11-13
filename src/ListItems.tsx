import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import GenericSortableTable, { RowDragHandleCell, type genericItemType } from './GenericSortableTable';
import { ItemFormModal } from './ItemFormModal';
import { QUESTION_FORMATS, type QuestionItem, type TextItem } from './item';
import { TextItemFormModal } from './TextItemFormModal';
import { PROVIDER_TAGS, useTtsChoice } from './useTts';

// One row of the items table. A group holds one kind of item, set by its
// item type: text items in a "text" group, question items otherwise. The full
// item rides along so Edit can prefill its form.
type ItemRow = genericItemType & ({ kind: 'question'; item: QuestionItem } | { kind: 'text'; item: TextItem });

// The API path of a row's item, e.g. /question-items/17 or /text-items/4.
const itemPath = (row: ItemRow) => `/${row.kind === 'question' ? 'question-items' : 'text-items'}/${row.item.id}`;

// Load an item group's items of its kind (the backend orders them by number), as table rows.
async function fetchItems(itemGroupId: string, isTextGroup: boolean, token: string | null): Promise<ItemRow[]> {
  if (isTextGroup) {
    const texts = await apiFetch<TextItem[]>(`/item-groups/${itemGroupId}/text-items`, token);
    return texts.map((item) => ({ kind: 'text', item, itemId: String(item.id), item_number: item.itemNumber }));
  }
  const questions = await apiFetch<QuestionItem[]>(`/item-groups/${itemGroupId}/question-items`, token);
  return questions.map((item) => ({ kind: 'question', item, itemId: String(item.id), item_number: item.itemNumber }));
}

// Show long text in a table cell on one line, cut off with an ellipsis; the full text is in the tooltip.
const truncatedCell = (text: string | null) => (
  <span className="block max-w-64 truncate" title={text ?? undefined}>
    {text}
  </span>
);

interface Props {
  // itemType ('text', 'question', or '' when unset) decides what "Add Item" adds.
  itemGroup: { itemId: string; item_number: number; itemType: string };
  onBack: () => void;
}

// Lists one item group's items in a drag-sortable table.
// "Add Item" opens the form for the group's item type: ItemFormModal in a
// "question" group, TextItemFormModal in a "text" group (each row's Edit button
// opens the one for its kind); delete, clone and renumber write straight to the backend.
export default function ListItems({ itemGroup, onBack }: Props) {
  const { token } = useAuth();
  const isTextGroup = itemGroup.itemType === 'text';
  const [items, setItems] = useState<ItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Format for the next new question item, picked in the dropdown beside "Add Item".
  const [newFormat, setNewFormat] = useState<number>(QUESTION_FORMATS[0].value);

  // Which item each form modal is open for: 'new', an existing item, or closed.
  const [questionFormFor, setQuestionFormFor] = useState<QuestionItem | 'new' | null>(null);
  const [textFormFor, setTextFormFor] = useState<TextItem | 'new' | null>(null);

  // A new item defaults to one past the current highest number.
  const nextItemNumber = items.reduce((max, i) => Math.max(max, i.item_number), 0) + 1;

  // Voice names for the Voice column: items store the voice id, e.g.
  // "SAz9YHcvj6GT2YYXdXww", shown by its label marked with the provider,
  // e.g. "11L River - Relaxed, …" (GG for Google).
  const { providers } = useTtsChoice(token);
  const voiceLabels = useMemo(
    () => new Map(providers.flatMap((p) => p.voices.map((v) => [v.id, `${PROVIDER_TAGS[p.id]} ${v.label}`] as const))),
    [providers],
  );

  // Refetch after a write; the initial load happens in the effect below.
  const getItems = useCallback(async () => {
    try {
      setItems(await fetchItems(itemGroup.itemId, isTextGroup, token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items.');
    }
  }, [itemGroup.itemId, isTextGroup, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchItems(itemGroup.itemId, isTextGroup, token);
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load items.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemGroup.itemId, isTextGroup, token]);

  const editItem = (row: ItemRow) => {
    if (row.kind === 'question') setQuestionFormFor(row.item);
    else setTextFormFor(row.item);
  };

  const deleteItem = async (row: ItemRow) => {
    if (!window.confirm(`Delete item ${row.item_number}?`)) {
      throw new Error('cancelled'); // keeps the row in the table
    }
    try {
      await apiFetch(itemPath(row), token, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item.');
      throw err;
    }
  };

  // The backend inserts the copy right after the source and shifts later item
  // numbers down, so refetch rather than patching the list locally.
  const cloneItem = async (row: ItemRow) => {
    try {
      await apiFetch(`${itemPath(row)}/clone`, token, { method: 'POST' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone item.');
    }
    await getItems();
  };

  // The backend has no bulk renumber endpoint, so PUT each item whose number changed.
  const renumberItems = async (rows: ItemRow[]) => {
    const original = new Map(items.map((i) => [i.itemId, i.item_number]));
    const changed = rows.filter((row) => original.get(row.itemId) !== row.item_number);
    try {
      await Promise.all(
        changed.map((row) => apiFetch(itemPath(row), token, { method: 'PUT', body: { itemNumber: row.item_number } })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to renumber items.');
    }
    await getItems();
  };

  const columns = useMemo<ColumnDef<ItemRow>[]>(() => {
    const dragHandle: ColumnDef<ItemRow> = {
      id: 'drag-handle',
      header: '',
      cell: () => <RowDragHandleCell />,
      size: 60,
    };
    const itemNumber: ColumnDef<ItemRow> = { accessorKey: 'item_number', header: 'Item Number' };
    const itemId: ColumnDef<ItemRow> = { accessorKey: 'itemId', header: 'Item ID' };
    if (isTextGroup) {
      return [
        dragHandle,
        itemNumber,
        { id: 'content', header: 'Content', cell: ({ row }) => row.original.kind === 'text' && truncatedCell(row.original.item.content) },
        itemId,
      ];
    }
    // A question item's field, for the question columns below.
    const q = (row: ItemRow) => (row.kind === 'question' ? row.item : null);
    return [
      dragHandle,
      itemNumber,
      { id: 'questionText', header: 'Question Text', cell: ({ row }) => truncatedCell(q(row.original)?.questionText ?? null) },
      { id: 'answerKey', header: 'Answer Key', cell: ({ row }) => truncatedCell(q(row.original)?.answerKey ?? null) },
      { id: 'choices', header: 'Choices', cell: ({ row }) => truncatedCell(q(row.original)?.choices ?? null) },
      {
        id: 'voiceName',
        header: 'Voice',
        // The label (id in the tooltip); the bare id if no provider lists it.
        cell: ({ row }) => {
          const id = q(row.original)?.voiceName;
          if (!id) return null;
          return (
            <span className="block max-w-48 truncate" title={id}>
              {voiceLabels.get(id) ?? id}
            </span>
          );
        },
      },
      // Format only means something for questions, so it's shown only in "question" groups.
      ...(itemGroup.itemType === 'question'
        ? [
            {
              id: 'format',
              header: 'Format',
              // "6 - Words Scramble"; just the number for a format with no name.
              cell: ({ row }) => {
                const format = q(row.original)?.format;
                if (format == null) return null;
                const label = QUESTION_FORMATS.find((f) => f.value === format)?.label;
                return <span className="whitespace-nowrap">{label ? `${format} - ${label}` : format}</span>;
              },
            } as ColumnDef<ItemRow>,
          ]
        : []),
      itemId,
    ];
  }, [voiceLabels, isTextGroup, itemGroup.itemType]);

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

      {/* What Add Item adds follows the group's item type. */}
      {itemGroup.itemType ? (
        <div className="my-3 flex items-center gap-2">
          <button
            onClick={() => (isTextGroup ? setTextFormFor('new') : setQuestionFormFor('new'))}
            className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white hover:opacity-90"
          >
            Add Item
          </button>
          {/* Format only applies to questions; the chosen one prefills the new item's form. */}
          {!isTextGroup && (
            <select
              value={newFormat}
              onChange={(e) => setNewFormat(Number(e.target.value))}
              aria-label="Format for new item"
              className="rounded border border-gray-300 p-2"
            >
              {QUESTION_FORMATS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label} ({value})
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <p className="my-3 text-gray-500">
          Set this item group's item type (question or text) on the item groups page to add items.
        </p>
      )}

      {items.length > 0 ? (
        <GenericSortableTable
          input_data={items}
          columns={columns}
          on_edit={editItem}
          on_delete={deleteItem}
          on_clone={cloneItem}
          on_renumber={renumberItems}
        />
      ) : (
        <p>No items found.</p>
      )}

      {questionFormFor && (
        <ItemFormModal
          // Remount per target so the form starts from that item's values.
          key={questionFormFor === 'new' ? 'new' : questionFormFor.id}
          itemGroupId={itemGroup.itemId}
          itemType={itemGroup.itemType}
          item={questionFormFor === 'new' ? undefined : questionFormFor}
          defaultItemNumber={nextItemNumber}
          defaultFormat={newFormat}
          onSaved={() => {
            setQuestionFormFor(null);
            getItems();
          }}
          onClose={() => setQuestionFormFor(null)}
        />
      )}

      {textFormFor && (
        <TextItemFormModal
          key={textFormFor === 'new' ? 'new' : textFormFor.id}
          itemGroupId={itemGroup.itemId}
          item={textFormFor === 'new' ? undefined : textFormFor}
          defaultItemNumber={nextItemNumber}
          onSaved={() => {
            setTextFormFor(null);
            getItems();
          }}
          onClose={() => setTextFormFor(null)}
        />
      )}
    </div>
  );
}
