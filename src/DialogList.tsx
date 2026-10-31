import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-context';

// List of dialog/conversation scripts, newest first. Any authenticated user may
// read them (GET /dialogs); admins additionally get an Edit button per row,
// since PUT /dialogs/:id is gated by an admin role check on the backend.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

interface Dialog {
  id: number;
  title: string;
  text: string;
  createdAt: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function DialogList() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';

  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Dialog | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/dialogs`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`Failed to load dialogs (${res.status})`);
        const data = (await res.json()) as Dialog[];
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
  }, []);

  // Swap the saved dialog into the list in place, so the row updates without a refetch.
  const onSaved = (saved: Dialog) => {
    setDialogs((ds) => ds.map((d) => (d.id === saved.id ? saved : d)));
    setEditing(null);
  };

  return (
    <aside
      style={{
        alignSelf: 'flex-start',
        width: 380,
        maxHeight: '80vh',
        overflowY: 'auto',
        padding: 16,
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fafafa',
        fontFamily: 'sans-serif',
      }}
    >
      <h3 style={{ marginTop: 0 }}>📘 Dialogs</h3>

      {status === 'loading' && <p style={{ color: '#666', margin: 0 }}>Loading…</p>}
      {status === 'error' && (
        <p style={{ color: '#d33', margin: 0 }} role="alert">
          ⚠️ {error}
        </p>
      )}
      {status === 'ok' && dialogs.length === 0 && (
        <p style={{ color: '#999', margin: 0 }}>No dialogs yet.</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dialogs.map((d) => (
          <li key={d.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{d.title}</div>
              {canEdit && (
                <button
                  onClick={() => setEditing(d)}
                  aria-label={`Edit ${d.title}`}
                  style={{ padding: '2px 10px', fontSize: 13, flexShrink: 0, cursor: 'pointer' }}
                >
                  Edit
                </button>
              )}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.5 }}>{d.text}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
              {new Date(d.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <EditDialogModal
          key={editing.id}
          dialog={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </aside>
  );
}

interface EditDialogModalProps {
  dialog: Dialog;
  onClose: () => void;
  onSaved: (saved: Dialog) => void;
}

// Edit popup for a single dialog. Keyed by dialog id in the parent, so opening a
// different row remounts it with that row's values as the initial state.
function EditDialogModal({ dialog, onClose, onSaved }: EditDialogModalProps) {
  const [title, setTitle] = useState(dialog.title);
  const [text, setText] = useState(dialog.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Escape closes the modal, matching what a dialog is expected to do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (!title.trim() || !text.trim()) {
      setError('Both a title and the dialog text are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/dialogs/${dialog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ title: title.trim(), text: text.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? `Save failed (${res.status})`);
      }
      onSaved((await res.json()) as Dialog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setSaving(false);
    }
  };

  return (
    <div
      // Clicking the backdrop (but not the panel itself) dismisses the modal.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-dialog-heading"
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 20,
          borderRadius: 8,
          background: '#fff',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
          fontFamily: 'sans-serif',
        }}
      >
        <h3 id="edit-dialog-heading" style={{ margin: 0 }}>
          ✏️ Edit dialog #{dialog.id}
        </h3>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Title
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ padding: 8, fontSize: 16 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Dialog text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            style={{
              padding: 10,
              resize: 'vertical',
              minHeight: 220,
              fontFamily: 'inherit',
              fontSize: 18,
              lineHeight: 1.5,
            }}
          />
        </label>

        {error && (
          <p style={{ margin: 0, color: '#d33' }} role="alert">
            ⚠️ {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '10px 16px' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={{ padding: '10px 16px' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DialogList;
