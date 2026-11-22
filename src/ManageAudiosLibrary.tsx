import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import type { Audio } from './item';

// One file of the audio library folder in S3 (GET /audios/library), with the
// Audio row that points to it, if any.
interface LibraryFile {
  key: string;
  url: string;
  size: number | null; // null: the row's file is missing from S3
  lastModified: string | null;
  audio: (Audio & { questionCount: number }) | null; // null: no row points to this file
}

interface Library {
  prefix: string; // e.g. "audios/library/" ("dev/audios/library/" on a development server)
  files: LibraryFile[];
}

// The "Manage Audios Library" tab: every file in the audio library folder, newest
// first, with what it says, whether it's kept, how many questions use it, and
// a Delete button. Deleting goes through the server (DELETE /audios/library),
// which deletes the Audio row first and refuses while a question uses it, so
// no question is left with a broken audio. Files with no row and rows whose
// file is missing are flagged.
export default function ManageAudiosLibrary() {
  const { token } = useAuth();
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null); // the key being deleted
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<Library>('/audios/library', token);
        if (!cancelled) {
          setLibrary(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the library.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, reload]);

  const remove = async (f: LibraryFile) => {
    const what = f.audio ? `"${f.audio.text}"` : 'this file (no database row points to it)';
    const note = f.audio?.kept ? '\n\nIt is kept for reuse.' : '';
    if (!window.confirm(`Delete ${what} from the library?${note}\n\nThis can't be undone.`)) return;
    setDeleting(f.key);
    try {
      await apiFetch(`/audios/library?key=${encodeURIComponent(f.key)}`, token, { method: 'DELETE' });
      setLibrary((prev) => (prev ? { ...prev, files: prev.files.filter((x) => x.key !== f.key) } : prev));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the file.');
    } finally {
      setDeleting(null);
    }
  };

  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (library?.files ?? []).filter((f) => {
    const haystack = `${f.audio?.text ?? ''} ${f.audio?.keywords.join(' ') ?? ''} ${fileName(f.key)}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
  const files = library?.files ?? [];
  const noRow = files.filter((f) => !f.audio).length;
  const missing = files.filter((f) => f.size === null).length;

  return (
    <div className="p-5 text-left">
      <h2 className="text-2xl">Manage Audios Library</h2>
      <p className="mt-1 text-sm text-gray-600">
        Every audio file in <code>{library?.prefix ?? 'audios/library/'}</code>. Delete removes the file and its
        database row; it's refused while a question uses the audio.
      </p>

      {error && (
        <p className="mt-2 text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by text, keyword or file name"
          className={`${inputClass} w-72`}
        />
        <button type="button" onClick={() => setReload((n) => n + 1)} className={buttonClass}>
          Refresh
        </button>
        {library && (
          <span className="text-sm text-gray-600">
            {files.length} file{files.length === 1 ? '' : 's'}
            {noRow > 0 && ` · ${noRow} without a database row`}
            {missing > 0 && ` · ${missing} missing from S3`}
            {words.length > 0 && ` · ${shown.length} shown`}
          </span>
        )}
      </div>

      {/* Closed by default; click the title to open it. */}
      <details className="mt-3 max-w-4xl rounded border border-[var(--border)] bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <summary className="cursor-pointer select-none font-semibold">What the Status and Used by columns mean</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="font-semibold">Kept</dt>
          <dd>
            The audio was chosen for reuse ("Keep for reuse" in a question's audio section). It shows up when you
            search the library from a question form, and it's never deleted automatically, even when no question
            uses it. Deleting it here removes it for good.
          </dd>
          <dt className="font-semibold text-gray-500">Not kept</dt>
          <dd>
            A generated voice that wasn't chosen for reuse. While a question uses it, it stays. Once no question uses
            it (a voice generated in a form that was never saved, replaced by a new one, or whose question was
            deleted), the server deletes it on its own after a day. Deleting it here only does that sooner.
          </dd>
          <dt className="font-semibold text-amber-700">No database row</dt>
          <dd>
            The file is in S3, but no audio in the database points to it, so no question can use it and the
            automatic cleanup never touches it. It's usually left over from a failed save or delete, or from a
            database that was reset. It's safe to delete.
          </dd>
          <dt className="font-semibold text-red-600">S3 File Missing</dt>
          <dd>
            The database has the audio, but its file isn't in S3 (it was probably deleted directly in S3). It can't
            be played. A question using it shows its text with no sound: give that question a new audio. When no
            question uses it, delete it here to remove the leftover database row.
          </dd>
          <dt className="font-semibold">Used by</dt>
          <dd>
            How many questions play this audio (as their audio or their trailing audio). While it's more than 0,
            Delete is turned off: take the audio off those questions first.
          </dd>
        </dl>
      </details>

      {library === null && !error && <p className="mt-3">Loading…</p>}
      {library && shown.length === 0 && <p className="mt-3 text-gray-600">No files.</p>}

      {shown.length > 0 && (
        <table className="mt-3 border-collapse">
          <thead>
            <tr>
              <th className={`${cellClass} text-left`}>Audio</th>
              <th className={`${cellClass} text-left`}>Text</th>
              <th className={`${cellClass} text-left`}>Status</th>
              <th className={`${cellClass} text-left`}>Used by</th>
              <th className={`${cellClass} text-left`}>Size</th>
              <th className={`${cellClass} text-left`}>Stored</th>
              <th className={`${cellClass} text-left`}>File</th>
              <th className={`${cellClass} text-left`}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const used = f.audio?.questionCount ?? 0;
              return (
                <tr key={f.key}>
                  <td className={cellClass}>
                    {f.size !== null ? (
                      <audio src={f.url} controls preload="none" className="h-8 w-48" />
                    ) : (
                      <span className="text-sm text-gray-500">—</span>
                    )}
                  </td>
                  <td className={`${cellClass} max-w-md`}>
                    {f.audio ? (
                      <>
                        {f.audio.text}
                        <div className="text-xs text-gray-500">
                          #{f.audio.id} · {f.audio.provider} {f.audio.voice}
                          {f.audio.keywords.length > 0 && ` · ${f.audio.keywords.join(', ')}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-500">(no database row)</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {f.size === null ? (
                      <span className="text-red-600">S3 File Missing</span>
                    ) : !f.audio ? (
                      <span className="text-amber-700">No database row</span>
                    ) : f.audio.kept ? (
                      'Kept'
                    ) : (
                      <span className="text-gray-500">Not kept</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {f.audio ? `${used} question${used === 1 ? '' : 's'}` : '—'}
                  </td>
                  <td className={cellClass}>{f.size === null ? '—' : formatSize(f.size)}</td>
                  <td className={cellClass}>
                    {new Date(f.lastModified ?? f.audio?.createdAt ?? 0).toLocaleString()}
                  </td>
                  <td className={`${cellClass} font-mono text-xs`} title={f.key}>
                    {fileName(f.key)}
                  </td>
                  <td className={cellClass}>
                    <button
                      type="button"
                      onClick={() => void remove(f)}
                      disabled={used > 0 || deleting !== null}
                      title={used > 0 ? 'A question uses this audio: take it off the question first.' : undefined}
                      className="my-1 rounded bg-red-600 px-2 font-bold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      {deleting === f.key ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function fileName(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1);
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

const cellClass = 'border-b border-[var(--border)] px-2 py-1';

const inputClass = 'rounded border border-gray-300 p-1.5';

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90 disabled:opacity-50';
