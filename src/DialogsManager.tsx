import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import { DialogFormModal } from './DialogFormModal';

// Ported from p2p-voice-chat-client's admin dialog list. Lists dialog /
// conversation scripts, newest first (GET /dialogs). Each dialog is a collapsed
// accordion item (number, title, date) that expands to show its text and note.
// Every dialog has "Edit" and "Delete" buttons, and the list ends with a "New"
// button; Edit and New open DialogFormModal. Only admins can sign in to this app, so editing is always on.

export interface Dialog {
  id: number;
  title: string;
  text: string;
  note: string | null; // optional admin note
  dialogNumber: number;
  createdAt: string;
}

export function DialogsManager() {
  const { token } = useAuth();
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  // Which dialog the form modal is open for: 'new', an existing dialog, or closed.
  const [formFor, setFormFor] = useState<Dialog | 'new' | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<Dialog[]>('/dialogs', token);
        if (!cancelled) {
          // Backend already sorts newest-first; sort defensively in case that changes.
          setDialogs([...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          setStatus('ok');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dialogs.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const deleteDialog = async (d: Dialog) => {
    if (!window.confirm(`Delete dialog "${d.dialogNumber}. ${d.title}"? This cannot be undone.`)) return;
    setDeletingId(d.id);
    setDeleteError(null);
    try {
      await apiFetch(`/dialogs/${d.id}`, token, { method: 'DELETE' });
      setDialogs((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete dialog.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-5 text-left">
      <h2 className="text-2xl">Dialogs</h2>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && (
        <p className="text-red-600" role="alert">
          ⚠️ {error}
        </p>
      )}
      {status === 'ok' && dialogs.length === 0 && <p>No dialogs yet.</p>}
      {deleteError && (
        <p className="text-red-600" role="alert">
          ⚠️ {deleteError}
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {dialogs.map((d) => (
          <li key={d.id} className="rounded-md border border-[var(--border)]">
            {/* Native <details> gives a keyboard-accessible accordion; each item toggles independently. */}
            <details>
              <summary className="cursor-pointer px-3 py-2.5">
                {/* Floated right, so Delete renders to the right of Edit. */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    deleteDialog(d);
                  }}
                  disabled={deletingId === d.id}
                  className="float-right ml-2 rounded bg-red-600 px-2.5 py-0.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {deletingId === d.id ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={(e) => {
                    // Inside <summary>, a click would also toggle the accordion.
                    e.preventDefault();
                    setFormFor(d);
                  }}
                  className="float-right ml-2 rounded bg-blue-600 px-2.5 py-0.5 text-sm font-bold text-white hover:opacity-90"
                >
                  Edit
                </button>
                <span className="font-semibold text-[var(--text-h)]">
                  {d.dialogNumber}. {d.title}
                </span>
                <span className="ml-2 text-xs">{new Date(d.createdAt).toLocaleDateString()}</span>
              </summary>
              <div className="whitespace-pre-wrap border-t border-[var(--border)] px-3 pt-2.5 pb-3 leading-normal">
                {d.text}
              </div>
              {d.note && (
                <div className="mx-3 mb-3 whitespace-pre-wrap border-l-4 border-amber-500 bg-amber-500/10 px-2.5 py-2 text-sm leading-normal">
                  <strong>Note:</strong> {d.note}
                </div>
              )}
            </details>
          </li>
        ))}
      </ul>

      {status !== 'loading' && (
        <button
          onClick={() => setFormFor('new')}
          className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2.5 font-bold text-white hover:opacity-90"
        >
          + New
        </button>
      )}

      {formFor && (
        <DialogFormModal
          // Remount per target so the form starts from that dialog's values.
          key={formFor === 'new' ? 'new' : formFor.id}
          dialog={formFor === 'new' ? undefined : formFor}
          // A new dialog defaults to the total count including itself.
          defaultDialogNumber={dialogs.length + 1}
          onSaved={(saved) => {
            setDialogs((prev) =>
              formFor === 'new'
                ? [saved, ...prev] // newest first, matching the list order
                : prev.map((d) => (d.id === saved.id ? saved : d)),
            );
            setFormFor(null);
          }}
          onCancel={() => setFormFor(null)}
        />
      )}
    </div>
  );
}

export default DialogsManager;
