import { useState } from 'react';
import { useAuth } from './auth-context';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// Temporary test panel: calls GET /levels with the current auth token and
// shows the HTTP status plus the raw JSON response.
export function LevelsTest() {
  const { token } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callLevels = async () => {
    setLoading(true);
    setStatus(null);
    setBody(null);
    try {
      const res = await fetch(`${API_BASE}/levels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus(`${res.status} ${res.statusText}`);
      const text = await res.text();
      try {
        setBody(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setBody(text);
      }
    } catch (err) {
      setStatus('Network error');
      setBody(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <button onClick={callLevels} disabled={loading} style={{ padding: '6px 12px' }}>
        {loading ? 'Calling…' : 'Test GET /levels'}
      </button>

      {status && (
        <p style={{ marginBottom: 4 }}>
          Status: <strong>{status}</strong>
        </p>
      )}
      {body !== null && (
        <pre
          style={{
            background: '#f6f8fa',
            padding: 12,
            borderRadius: 6,
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          {body}
        </pre>
      )}
    </div>
  );
}

export default LevelsTest;
