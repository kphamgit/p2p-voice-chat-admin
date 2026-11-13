import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import GenericSortableTable, { RowDragHandleCell, type genericItemType } from './GenericSortableTable';
import ListUnits from './ListUnits';

// A level as returned by the backend's /levels endpoints.
interface Level {
  id: number;
  name: string;
  levelNumber: number;
  description: string | null;
}

interface LevelDataRowProps extends genericItemType {
  name: string;
  description: string;
}

// Load levels ordered by level number, mapped to the table's row shape.
async function fetchLevels(token: string | null): Promise<LevelDataRowProps[]> {
  const data = await apiFetch<Level[]>('/levels', token);
  return data
    .sort((a, b) => a.levelNumber - b.levelNumber)
    .map((level) => ({
      itemId: String(level.id),
      item_number: level.levelNumber,
      name: level.name,
      description: level.description ?? '',
    }));
}

// Lists levels in a drag-sortable table, with forms to add a new level and
// edit an existing one. Delete and renumber write straight to the backend.
export default function ListLevels() {
  const { token } = useAuth();
  const [levels, setLevels] = useState<LevelDataRowProps[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New-level form
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Edit form; null when no row is being edited
  const [editing, setEditing] = useState<LevelDataRowProps | null>(null);

  // The level whose units are shown instead of the levels table; null shows the levels.
  const [selectedLevel, setSelectedLevel] = useState<LevelDataRowProps | null>(null);

  // Refetch after a write; the initial load happens in the effect below.
  const getLevels = useCallback(async () => {
    try {
      setLevels(await fetchLevels(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load levels.');
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchLevels(token);
        if (!cancelled) setLevels(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load levels.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const createLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    // Default the number to one past the current highest level.
    const levelNumber = newNumber
      ? Number(newNumber)
      : levels.reduce((max, l) => Math.max(max, l.item_number), 0) + 1;
    try {
      await apiFetch('/levels', token, {
        method: 'POST',
        body: { name: newName.trim(), levelNumber, description: newDescription.trim() || null },
      });
      setNewName('');
      setNewNumber('');
      setNewDescription('');
      await getLevels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create level.');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiFetch(`/levels/${editing.itemId}`, token, {
        method: 'PUT',
        // An emptied description is stored as null rather than ''.
        body: {
          name: editing.name.trim(),
          levelNumber: editing.item_number,
          description: editing.description.trim() || null,
        },
      });
      setEditing(null);
      await getLevels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update level.');
    }
  };

  const deleteLevel = async (row: LevelDataRowProps) => {
    if (!window.confirm(`Delete level "${row.name}"?`)) {
      throw new Error('cancelled'); // keeps the row in the table
    }
    try {
      await apiFetch(`/levels/${row.itemId}`, token, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete level.');
      throw err;
    }
  };

  // The backend has no bulk renumber endpoint, so PUT each level whose number changed.
  const renumberLevels = async (rows: LevelDataRowProps[]) => {
    const original = new Map(levels.map((l) => [l.itemId, l.item_number]));
    const changed = rows.filter((row) => original.get(row.itemId) !== row.item_number);
    try {
      await Promise.all(
        changed.map((row) =>
          apiFetch(`/levels/${row.itemId}`, token, { method: 'PUT', body: { levelNumber: row.item_number } }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to renumber levels.');
    }
    await getLevels();
  };

  const columns = useMemo<ColumnDef<LevelDataRowProps>[]>(
    () => [
      {
        id: 'drag-handle',
        header: '',
        cell: () => <RowDragHandleCell />,
        size: 60,
      },
      { accessorKey: 'item_number', header: 'Level Number' },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (info) => (
          <button
            onClick={() => setSelectedLevel(info.row.original)}
            className="text-blue-600 underline hover:opacity-80"
          >
            {info.row.original.name}
          </button>
        ),
      },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'itemId', header: 'Level ID' },
    ],
    [],
  );

  if (selectedLevel) {
    return <ListUnits level={selectedLevel} onBack={() => setSelectedLevel(null)} />;
  }

  return (
    <div className="p-5 text-left">
      <h2 className="text-2xl">Levels</h2>

      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}

      {levels.length > 0 ? (
        <GenericSortableTable
          input_data={levels}
          columns={columns}
          on_edit={(row) => setEditing({ ...row })}
          on_delete={deleteLevel}
          on_renumber={renumberLevels}
        />
      ) : (
        <p>No levels found.</p>
      )}

      {editing && (
        <form onSubmit={saveEdit} className={formClass}>
          <strong>Edit level {editing.itemId}</strong>
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
            placeholder="Level number"
            required
            className={`${inputClass} w-24`}
          />
          <input
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="Description (optional)"
            className={`${inputClass} w-72`}
          />
          <button type="submit" className={buttonClass}>Save</button>
          <button type="button" onClick={() => setEditing(null)} className={buttonClass}>Cancel</button>
        </form>
      )}

      <form onSubmit={createLevel} className={formClass}>
        <strong>New level</strong>
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
        <button type="submit" className={`${buttonClass} bg-green-600 text-white`}>Add Level</button>
      </form>
    </div>
  );
}

const formClass = 'mt-4 flex flex-wrap items-center gap-2';

const inputClass = 'rounded border border-gray-300 p-1.5';

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90';
