import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import { ReviewLogModal } from './ReviewLogModal';

// A user as returned by GET /users (the backend never sends the password hash).
interface User {
  id: number;
  name: string;
  role: string;
  createdAt: string;
}

const ROLES = ['student', 'admin'];

// Table of every user. Each row's Edit button opens a form below the table to
// change the username and role (PUT /users/:id, admin-only on the backend).
// A student's Review Log button shows their vocabulary-review answers.
export default function ListUsers() {
  const { token, user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit form; null when no row is being edited
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  // The student whose review log is open, if any.
  const [logFor, setLogFor] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<User[]>('/users', token);
        if (!cancelled) setUsers(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load users.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const saved = await apiFetch<User>(`/users/${editing.id}`, token, {
        method: 'PUT',
        body: { name: editing.name.trim(), role: editing.role },
      });
      setUsers((prev) => prev?.map((u) => (u.id === saved.id ? saved : u)) ?? null);
      setEditing(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  // Admins can't remove their own admin role (the backend refuses it too).
  const isEditingSelf = editing !== null && editing.id === me?.id;

  return (
    <div className="p-5 text-left">
      <h2 className="text-2xl">Users</h2>

      {error && (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      )}

      {users === null && !error && <p>Loading…</p>}

      {users && users.length === 0 && <p>No users found.</p>}

      {users && users.length > 0 && (
        <table className="border-collapse">
          <thead>
            <tr>
              <th className={`${cellClass} text-left`}>ID</th>
              <th className={`${cellClass} text-left`}>Username</th>
              <th className={`${cellClass} text-left`}>Role</th>
              <th className={`${cellClass} text-left`}>Created</th>
              <th className={`${cellClass} text-left`}>Edit</th>
              <th className={`${cellClass} text-left`}>Review</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className={cellClass}>{u.id}</td>
                <td className={cellClass}>{u.name}</td>
                <td className={cellClass}>{u.role}</td>
                <td className={cellClass}>{new Date(u.createdAt).toLocaleString()}</td>
                <td className={cellClass}>
                  <button
                    onClick={() => setEditing({ ...u })}
                    className="my-1 rounded bg-blue-600 px-2 font-bold text-white hover:opacity-90"
                  >
                    Edit
                  </button>
                </td>
                <td className={cellClass}>
                  {u.role === 'student' && (
                    <button
                      onClick={() => setLogFor(u)}
                      className="my-1 rounded bg-gray-600 px-2 font-bold text-white hover:opacity-90"
                    >
                      Review Log
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <form onSubmit={saveEdit} className="mt-4 flex flex-wrap items-center gap-2">
          <strong>Edit user {editing.id}</strong>
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Username"
            required
            className={inputClass}
          />
          <select
            value={editing.role}
            onChange={(e) => setEditing({ ...editing, role: e.target.value })}
            disabled={isEditingSelf}
            title={isEditingSelf ? "You can't change your own role." : undefined}
            className={inputClass}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(null)} disabled={saving} className={buttonClass}>
            Cancel
          </button>
        </form>
      )}

      {logFor && <ReviewLogModal userId={logFor.id} username={logFor.name} onClose={() => setLogFor(null)} />}
    </div>
  );
}

const cellClass = 'border-b border-[var(--border)] px-2 py-1';

const inputClass = 'rounded border border-gray-300 p-1.5';

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90 disabled:opacity-50';
