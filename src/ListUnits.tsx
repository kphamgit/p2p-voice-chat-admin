import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import GenericSortableTable, { RowDragHandleCell, type genericItemType } from './GenericSortableTable';
import ListItemGroups from './ListItemGroups';

// A unit as returned by the backend's /units and /levels/:id/units endpoints.
interface Unit {
  id: number;
  name: string;
  unitNumber: number;
  description: string | null;
  lecture: string | null;
  levelId: number;
  _count: { itemGroups: number }; // included by GET /levels/:id/units
}

interface UnitDataRowProps extends genericItemType {
  name: string;
  description: string;
  lecture: string;
  itemGroupCount: number;
}

// Load a level's units (the backend orders them by unit number), mapped to the table's row shape.
async function fetchUnits(levelId: string, token: string | null): Promise<UnitDataRowProps[]> {
  const data = await apiFetch<Unit[]>(`/levels/${levelId}/units`, token);
  return data.map((unit) => ({
    itemId: String(unit.id),
    item_number: unit.unitNumber,
    name: unit.name,
    description: unit.description ?? '',
    lecture: unit.lecture ?? '',
    itemGroupCount: unit._count.itemGroups,
  }));
}

interface Props {
  level: { itemId: string; name: string };
  onBack: () => void;
}

// Lists one level's units in a drag-sortable table, with forms to add a new
// unit and edit an existing one. Delete and renumber write straight to the backend.
export default function ListUnits({ level, onBack }: Props) {
  const { token } = useAuth();
  const [units, setUnits] = useState<UnitDataRowProps[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New-unit form
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLecture, setNewLecture] = useState('');

  // Edit form; null when no row is being edited
  const [editing, setEditing] = useState<UnitDataRowProps | null>(null);

  // The unit whose item groups are shown instead of the units table; null shows the units.
  const [selectedUnit, setSelectedUnit] = useState<UnitDataRowProps | null>(null);

  // Refetch after a write; the initial load happens in the effect below.
  const getUnits = useCallback(async () => {
    try {
      setUnits(await fetchUnits(level.itemId, token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load units.');
    }
  }, [level.itemId, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchUnits(level.itemId, token);
        if (!cancelled) setUnits(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load units.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [level.itemId, token]);

  const createUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Default the number to one past the current highest unit.
    const unitNumber = newNumber
      ? Number(newNumber)
      : units.reduce((max, u) => Math.max(max, u.item_number), 0) + 1;
    try {
      await apiFetch('/units', token, {
        method: 'POST',
        body: {
          name: newName.trim(),
          unitNumber,
          levelId: Number(level.itemId),
          description: newDescription.trim() || null,
          lecture: newLecture.trim() || null,
        },
      });
      setNewName('');
      setNewNumber('');
      setNewDescription('');
      setNewLecture('');
      await getUnits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create unit.');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiFetch(`/units/${editing.itemId}`, token, {
        method: 'PUT',
        // An emptied description or lecture is stored as null rather than ''.
        body: {
          name: editing.name.trim(),
          unitNumber: editing.item_number,
          description: editing.description.trim() || null,
          lecture: editing.lecture.trim() || null,
        },
      });
      setEditing(null);
      await getUnits();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update unit.');
    }
  };

  const deleteUnit = async (row: UnitDataRowProps) => {
    if (!window.confirm(`Delete unit "${row.name}"?`)) {
      throw new Error('cancelled'); // keeps the row in the table
    }
    try {
      await apiFetch(`/units/${row.itemId}`, token, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete unit.');
      throw err;
    }
  };

  // The backend has no bulk renumber endpoint, so PUT each unit whose number changed.
  const renumberUnits = async (rows: UnitDataRowProps[]) => {
    const original = new Map(units.map((u) => [u.itemId, u.item_number]));
    const changed = rows.filter((row) => original.get(row.itemId) !== row.item_number);
    try {
      await Promise.all(
        changed.map((row) =>
          apiFetch(`/units/${row.itemId}`, token, { method: 'PUT', body: { unitNumber: row.item_number } }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to renumber units.');
    }
    await getUnits();
  };

  const columns = useMemo<ColumnDef<UnitDataRowProps>[]>(
    () => [
      {
        id: 'drag-handle',
        header: '',
        cell: () => <RowDragHandleCell />,
        size: 60,
      },
      { accessorKey: 'item_number', header: 'Unit Number' },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (info) => (
          <button
            onClick={() => setSelectedUnit(info.row.original)}
            className="text-blue-600 underline hover:opacity-80"
          >
            {info.row.original.name}
          </button>
        ),
      },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'itemGroupCount', header: 'No. of Item Groups' },
      { accessorKey: 'itemId', header: 'Unit ID' },
    ],
    [],
  );

  if (selectedUnit) {
    return (
      <ListItemGroups
        unit={selectedUnit}
        onBack={() => {
          setSelectedUnit(null);
          getUnits(); // refresh item group counts after adding/deleting item groups
        }}
      />
    );
  }

  return (
    <div className="p-5 text-left">
      <button onClick={onBack} className="mb-2 text-blue-600 underline hover:opacity-80">
        ← Back to levels
      </button>
      <h2 className="text-2xl">Units of {level.name}</h2>

      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}

      {units.length > 0 ? (
        <GenericSortableTable
          input_data={units}
          columns={columns}
          on_edit={(row) => setEditing({ ...row })}
          on_delete={deleteUnit}
          on_renumber={renumberUnits}
        />
      ) : (
        <p>No units found.</p>
      )}

      {editing && (
        <form onSubmit={saveEdit} className={formClass}>
          <strong>Edit unit {editing.itemId}</strong>
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Name"
            required
            className={inputClass}
          />
          <input
            type="number"
            value={editing.item_number}
            onChange={(e) => setEditing({ ...editing, item_number: Number(e.target.value) })}
            placeholder="Unit number"
            required
            className={`${inputClass} w-24`}
          />
          <input
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="Description (optional)"
            className={`${inputClass} w-72`}
          />
          <textarea
            value={editing.lecture}
            onChange={(e) => setEditing({ ...editing, lecture: e.target.value })}
            placeholder="Lecture (optional)"
            rows={8}
            className={textareaClass}
          />
          <button type="submit" className={buttonClass}>Save</button>
          <button type="button" onClick={() => setEditing(null)} className={buttonClass}>Cancel</button>
        </form>
      )}

      <form onSubmit={createUnit} className={formClass}>
        <strong>New unit</strong>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name"
          required
          className={inputClass}
        />
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
        <textarea
          value={newLecture}
          onChange={(e) => setNewLecture(e.target.value)}
          placeholder="Lecture (optional)"
          rows={8}
          className={textareaClass}
        />
        <button type="submit" className={`${buttonClass} bg-green-600 text-white`}>Add Unit</button>
      </form>
    </div>
  );
}

const formClass = 'mt-4 flex flex-wrap items-center gap-2';

const inputClass = 'rounded border border-gray-300 p-1.5';

// Full width so it wraps onto its own line in the flex-wrap forms.
const textareaClass = `${inputClass} w-full resize-y font-[inherit] leading-normal`;

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90';
