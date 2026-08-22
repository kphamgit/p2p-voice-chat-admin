import { useState } from 'react';

// Teacher-only panel (rendered when the logged-in username is "teacher"): a form
// to author a dialog/conversation script and save it to the backend Dialog model
// via POST /dialogs. The Dialog model requires both a title and text.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'ok'; msg: string }
  | { kind: 'error'; msg: string };

export function TeacherDialogPanel() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const save = async () => {
    if (!title.trim() || !text.trim()) {
      setStatus({ kind: 'error', msg: 'Both a title and the dialog text are required.' });
      return;
    }
    setStatus({ kind: 'saving' });
    try {
      const res = await fetch(`${API_BASE}/dialogs`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title: title.trim(), text: text.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? `Save failed (${res.status})`);
      }
      setStatus({ kind: 'ok', msg: 'Dialog saved.' });
      setTitle('');
      setText('');
    } catch (err) {
      setStatus({ kind: 'error', msg: err instanceof Error ? err.message : 'Save failed.' });
    }
  };

  // Clear any success/error message once the teacher starts editing again.
  const onEdit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setStatus((s) => (s.kind === 'idle' || s.kind === 'saving' ? s : { kind: 'idle' }));
  };

  return (
    <aside
      style={{
        position: 'sticky',
        top: 16,
        alignSelf: 'flex-start',
        width: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 16,
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fafafa',
        fontFamily: 'sans-serif',
      }}
    >
      <h3 style={{ margin: 0 }}>✍️ New Dialog</h3>
      <p style={{ margin: 0, color: '#666', fontSize: 13 }}>
        Write a conversation script and save it to the database.
      </p>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => onEdit(setTitle)(e.target.value)}
          placeholder="e.g. At the restaurant"
          style={{ padding: 8, fontSize: 16 }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        Dialog text
        <textarea
          value={text}
          onChange={(e) => onEdit(setText)(e.target.value)}
          placeholder={'A: Hello!\nB: Hi, how are you?'}
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

      <button onClick={save} disabled={status.kind === 'saving'} style={{ padding: '10px 16px' }}>
        {status.kind === 'saving' ? 'Saving…' : 'Save dialog'}
      </button>

      {status.kind === 'ok' && <p style={{ margin: 0, color: '#1a7f37' }}>✓ {status.msg}</p>}
      {status.kind === 'error' && (
        <p style={{ margin: 0, color: '#d33' }} role="alert">
          ⚠️ {status.msg}
        </p>
      )}
    </aside>
  );
}

export default TeacherDialogPanel;
