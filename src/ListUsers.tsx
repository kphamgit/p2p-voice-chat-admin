import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';

// A user as returned by GET /users (the backend never sends the password hash).
interface User {
  id: number;
  name: string;
  role: string;
  createdAt: string;
}

// Read-only table of every user.
export default function ListUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className={cellClass}>{u.id}</td>
                <td className={cellClass}>{u.name}</td>
                <td className={cellClass}>{u.role}</td>
                <td className={cellClass}>{new Date(u.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cellClass = 'border-b border-[var(--border)] px-2 py-1';
