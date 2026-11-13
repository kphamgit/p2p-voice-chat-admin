import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import GenericSortableTable, { RowDragHandleCell, type genericItemType } from './GenericSortableTable';
import ListItems from './ListItems';
import { DISPLAY_TYPES, ITEM_TYPES, type ItemDisplayType, type ItemType } from './item';

// An item group as returned by the backend's /item-groups and /units/:id/item-groups endpoints.
interface ItemGroup {
  id: number;
  itemGroupNumber: number;
  description: string | null;
  displayType: ItemDisplayType | null;
  itemType: ItemType | null;
  unitId: number;
  _count: { questionItems: number }; // included by GET /units/:id/item-groups
}

interface ItemGroupDataRowProps extends genericItemType {
  description: string;
  displayType: string;
  itemType: string;
  itemCount: number;
}

// Load a unit's item groups (the backend orders them by number), mapped to the table's row shape.
async function fetchItemGroups(unitId: string, token: string | null): Promise<ItemGroupDataRowProps[]> {
  const data = await apiFetch<ItemGroup[]>(`/units/${unitId}/item-groups`, token);
  return data.map((group) => ({
    itemId: String(group.id),
    item_number: group.itemGroupNumber,
    description: group.description ?? '',
    displayType: group.displayType ?? '',
    itemType: group.itemType ?? '',
    itemCount: group._count.questionItems,
  }));
}

interface Props {
  unit: { itemId: string; name: string };
  onBack: () => void;
}

// Lists one unit's item groups in a drag-sortable table, with forms to add a new
// item group and edit an existing one. Delete and renumber write straight to the backend.
export default function ListItemGroups({ unit, onBack }: Props) {
  const { token } = useAuth();
  const [itemGroups, setItemGroups] = useState<ItemGroupDataRowProps[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New-item-group form
  const [newNumber, setNewNumber] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDisplayType, setNewDisplayType] = useState('');
  const [newItemType, setNewItemType] = useState('');

  // Edit form; null when no row is being edited
  const [editing, setEditing] = useState<ItemGroupDataRowProps | null>(null);

  // The item group whose items are shown instead of the item groups table; null shows the item groups.
  const [selectedItemGroup, setSelectedItemGroup] = useState<ItemGroupDataRowProps | null>(null);

  // Refetch after a write; the initial load happens in the effect below.
  const getItemGroups = useCallback(async () => {
    try {
      setItemGroups(await fetchItemGroups(unit.itemId, token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item groups.');
    }
  }, [unit.itemId, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchItemGroups(unit.itemId, token);
        if (!cancelled) setItemGroups(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load item groups.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unit.itemId, token]);

  const createItemGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    // Default the number to one past the current highest item group.
    const itemGroupNumber = newNumber
      ? Number(newNumber)
      : itemGroups.reduce((max, g) => Math.max(max, g.item_number), 0) + 1;
    try {
      await apiFetch('/item-groups', token, {
        method: 'POST',
        body: {
          itemGroupNumber,
          unitId: Number(unit.itemId),
          description: newDescription.trim() || null,
          displayType: newDisplayType || null,
          itemType: newItemType || null,
        },
      });
      setNewNumber('');
      setNewDescription('');
      setNewDisplayType('');
      setNewItemType('');
      await getItemGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item group.');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiFetch(`/item-groups/${editing.itemId}`, token, {
        method: 'PUT',
        // An emptied description, display type, or item type is stored as null rather than ''.
        body: {
          itemGroupNumber: editing.item_number,
          description: editing.description.trim() || null,
          displayType: editing.displayType || null,
          itemType: editing.itemType || null,
        },
      });
      setEditing(null);
      await getItemGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item group.');
    }
  };

  const deleteItemGroup = async (row: ItemGroupDataRowProps) => {
    if (!window.confirm(`Delete item group ${row.item_number}?`)) {
      throw new Error('cancelled'); // keeps the row in the table
    }
    try {
      await apiFetch(`/item-groups/${row.itemId}`, token, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item group.');
      throw err;
    }
  };

  // The backend has no bulk renumber endpoint, so PUT each item group whose number changed.
  const renumberItemGroups = async (rows: ItemGroupDataRowProps[]) => {
    const original = new Map(itemGroups.map((g) => [g.itemId, g.item_number]));
    const changed = rows.filter((row) => original.get(row.itemId) !== row.item_number);
    try {
      await Promise.all(
        changed.map((row) =>
          apiFetch(`/item-groups/${row.itemId}`, token, {
            method: 'PUT',
            body: { itemGroupNumber: row.item_number },
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to renumber item groups.');
    }
    await getItemGroups();
  };

  const columns = useMemo<ColumnDef<ItemGroupDataRowProps>[]>(
    () => [
      {
        id: 'drag-handle',
        header: '',
        cell: () => <RowDragHandleCell />,
        size: 60,
      },
      {
        accessorKey: 'item_number',
        header: 'Item Group Number',
        cell: (info) => (
          <button
            onClick={() => setSelectedItemGroup(info.row.original)}
            className="text-blue-600 underline hover:opacity-80"
          >
            {info.row.original.item_number}
          </button>
        ),
      },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'displayType', header: 'Display Type' },
      { accessorKey: 'itemType', header: 'Item Type' },
      { accessorKey: 'itemCount', header: 'No. of Items' },
      { accessorKey: 'itemId', header: 'Item Group ID' },
    ],
    [],
  );

  if (selectedItemGroup) {
    return (
      <ListItems
        itemGroup={selectedItemGroup}
        onBack={() => {
          setSelectedItemGroup(null);
          getItemGroups(); // refresh item counts after adding/deleting items
        }}
      />
    );
  }

  return (
    <div className="p-5 text-left">
      <button onClick={onBack} className="mb-2 text-blue-600 underline hover:opacity-80">
        ← Back to units
      </button>
      <h2 className="text-2xl">Item groups of {unit.name}</h2>

      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}

      {itemGroups.length > 0 ? (
        <GenericSortableTable
          input_data={itemGroups}
          columns={columns}
          on_edit={(row) => setEditing({ ...row })}
          on_delete={deleteItemGroup}
          on_renumber={renumberItemGroups}
        />
      ) : (
        <p>No item groups found.</p>
      )}

      {editing && (
        <form onSubmit={saveEdit} className={formClass}>
          <strong>Edit item group {editing.itemId}</strong>
          <input
            type="number"
            value={editing.item_number}
            onChange={(e) => setEditing({ ...editing, item_number: Number(e.target.value) })}
            placeholder="Item group number"
            required
            className={`${inputClass} w-24`}
          />
          <input
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="Description (optional)"
            className={`${inputClass} w-72`}
          />
          <DisplayTypeSelect
            value={editing.displayType}
            onChange={(displayType) => setEditing({ ...editing, displayType })}
          />
          <ItemTypeSelect value={editing.itemType} onChange={(itemType) => setEditing({ ...editing, itemType })} />
          <button type="submit" className={buttonClass}>Save</button>
          <button type="button" onClick={() => setEditing(null)} className={buttonClass}>Cancel</button>
        </form>
      )}

      <form onSubmit={createItemGroup} className={formClass}>
        <strong>New item group</strong>
        <input
          type="number"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Number (auto)"
          className={`${inputClass} w-36`}
        />
        <input
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Description (optional)"
          className={`${inputClass} w-72`}
        />
        <DisplayTypeSelect value={newDisplayType} onChange={setNewDisplayType} />
        <ItemTypeSelect value={newItemType} onChange={setNewItemType} />
        <button type="submit" className={`${buttonClass} bg-green-600 text-white`}>Add Item Group</button>
      </form>
    </div>
  );
}

// Dropdown for an item group's item type; '' means none (stored as null).
function ItemTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Item type"
      className={`${inputClass} w-40`}
    >
      <option value="">Item type (none)</option>
      {ITEM_TYPES.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </select>
  );
}

// Dropdown for an item group's display type; '' means none (stored as null).
function DisplayTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Display type"
      className={`${inputClass} w-48`}
    >
      <option value="">Display type (none)</option>
      {DISPLAY_TYPES.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </select>
  );
}

const formClass = 'mt-4 flex flex-wrap items-center gap-2';

const inputClass = 'rounded border border-gray-300 p-1.5';

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90';
