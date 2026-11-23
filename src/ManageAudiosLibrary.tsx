import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch, apiFetchBlob } from './api';
import { toWav, wavFileName } from './wav';
import type { Audio } from './item';

// An audio row as GET /audios/library returns it.
type LibraryAudio = Audio & { questionCount: number; createdBy: string | null };

type KeptFilter = 'all' | 'kept' | 'not_kept';

// A library file that no audio row points to (GET /audios/library/check).
interface StrayFile {
  key: string;
  url: string;
  size: number;
  lastModified: string;
}

interface CheckResult {
  strayFiles: StrayFile[];
  missingFiles: LibraryAudio[];
}

// The "Manage Audios Library" tab. The library has two linked parts: a row in
// the database (what it says, keywords, kept, which questions use it) and an
// MP3 in S3. The rows are the source of truth, so the table lists the rows
// (GET /audios/library). Delete removes the row, then its file
// (DELETE /audios/:id), and is refused while a question uses the audio.
// "Check S3" compares the folder with the rows (it lists the whole folder, so
// it only runs when asked) and shows only the problems: files no row points
// to, and rows whose file is gone.
export default function ManageAudiosLibrary() {
  const { token } = useAuth();
  const [audios, setAudios] = useState<LibraryAudio[] | null>(null);
  const [prefix, setPrefix] = useState('');
  const [kept, setKept] = useState<KeptFilter>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(''); // the query last searched
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // the row id or file key being deleted
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [converting, setConverting] = useState<number | null>(null); // the row whose WAV is being made

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ kept, q: search });
        const data = await apiFetch<{ prefix: string; audios: LibraryAudio[] }>(`/audios/library?${params}`, token);
        if (!cancelled) {
          setAudios(data.audios);
          setPrefix(data.prefix);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err, 'Failed to load the library.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kept, search, reload]);

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck(await apiFetch<CheckResult>('/audios/library/check', token));
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Checking S3 failed.'));
    } finally {
      setChecking(false);
    }
  };

  const deleteAudio = async (a: LibraryAudio) => {
    const note = a.kept ? '\n\nIt is kept for reuse.' : '';
    if (!window.confirm(`Delete audio #${a.id} "${a.text}": its database row and its S3 file?${note}\n\nThis can't be undone.`)) return;
    setBusy(String(a.id));
    try {
      await apiFetch(`/audios/${a.id}`, token, { method: 'DELETE' });
      setAudios((prev) => prev?.filter((x) => x.id !== a.id) ?? null);
      setCheck((prev) => prev && { ...prev, missingFiles: prev.missingFiles.filter((x) => x.id !== a.id) });
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Failed to delete the audio.'));
    } finally {
      setBusy(null);
    }
  };

  const deleteStray = async (f: StrayFile) => {
    if (!window.confirm(`Delete ${fileName(f.key)} from S3? No database row points to it.\n\nThis can't be undone.`)) return;
    setBusy(f.key);
    try {
      await apiFetch(`/audios/library/stray?key=${encodeURIComponent(f.key)}`, token, { method: 'DELETE' });
      setCheck((prev) => prev && { ...prev, strayFiles: prev.strayFiles.filter((x) => x.key !== f.key) });
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Failed to delete the file.'));
    } finally {
      setBusy(null);
    }
  };

  // The S3 file (an MP3, read through the server) converted to WAV in the
  // browser, at its own sample rate, and saved as "<what it says>.wav".
  const downloadWav = async (a: LibraryAudio) => {
    if (converting !== null) return;
    setConverting(a.id);
    setError(null);
    try {
      const mp3 = await apiFetchBlob(`/audios/${a.id}/file`, token);
      const url = URL.createObjectURL(await toWav(mp3));
      const link = document.createElement('a');
      link.href = url;
      link.download = wavFileName(a.text);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(errorText(err, `Audio #${a.id} couldn't be converted to WAV.`));
    } finally {
      setConverting(null);
    }
  };

  const deleteButton = (onClick: () => void, id: string, used: number) => (
    <button
      type="button"
      onClick={onClick}
      disabled={used > 0 || busy !== null}
      title={used > 0 ? 'A question uses this audio: take it off the question first.' : undefined}
      className="my-1 rounded bg-red-600 px-2 font-bold text-white hover:opacity-90 disabled:opacity-40"
    >
      {busy === id ? 'Deleting…' : 'Delete'}
    </button>
  );

  return (
    <div className="p-5 text-left">
      <h2 className="text-2xl">Manage Audios Library</h2>
      <p className="mt-1 text-sm text-[var(--text-h)]">
        The audio in the database. Each audio's MP3 is in S3 at <code>{prefix || 'audios/library/'}&lt;random id&gt;.mp3</code>.
        Delete removes the database row and the file; it's refused while a question uses the audio.
      </p>

      {error && (
        <p className="mt-2 text-red-600" role="alert">
          {error}
        </p>
      )}

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
          setReload((n) => n + 1);
        }}
      >
        <label className="flex items-center gap-1">
          Show
          <select value={kept} onChange={(e) => setKept(e.target.value as KeptFilter)} className={inputClass}>
            <option value="all">All audio</option>
            <option value="kept">Kept</option>
            <option value="not_kept">Not kept</option>
          </select>
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Words or keywords"
          className={`${inputClass} w-64`}
        />
        <button type="submit" className={buttonClass}>
          Search / Refresh
        </button>
        <button type="button" onClick={() => void runCheck()} disabled={checking} className={buttonClass}>
          {checking ? 'Checking S3…' : 'Check S3'}
        </button>
        {audios && (
          <span className="text-sm text-gray-600">
            {audios.length} audio{audios.length === 1 ? '' : 's'}
            {audios.length >= 200 && ' (the newest 200: search to narrow)'}
          </span>
        )}
      </form>

      <details className="mt-3 max-w-4xl rounded border border-[var(--border)] bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <summary className="cursor-pointer select-none font-semibold">What the columns and Check S3 mean</summary>
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
          <dt className="font-semibold">Used by</dt>
          <dd>
            How many questions play this audio (as their audio or their trailing audio). While it's more than 0,
            Delete is turned off: take the audio off those questions first.
          </dd>
          <dt className="font-semibold">Check S3</dt>
          <dd>
            Compares the S3 folder with the database and lists only what doesn't match. It reads the whole folder, so
            it runs only when you click it.
          </dd>
          <dt className="font-semibold text-amber-700">No database row</dt>
          <dd>
            A file in S3 that no audio in the database points to, so no question can use it. It's usually left over
            from a failed save or delete, or from a database that was reset. It's safe to delete, and the server
            deletes such files on its own once they're a day old.
          </dd>
          <dt className="font-semibold text-red-600">S3 File Missing</dt>
          <dd>
            The database has the audio, but its file isn't in S3 (it was probably deleted directly in S3). It can't
            be played. A question using it has no sound: give that question a new audio. When no question uses it,
            delete it to remove the leftover database row.
          </dd>
        </dl>
      </details>

      {check && (
        <section className="mt-4 max-w-5xl rounded border border-[var(--border)] p-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Check S3</h3>
            <button type="button" onClick={() => setCheck(null)} className="rounded bg-gray-600 px-2 py-0.5 text-sm font-bold text-white hover:opacity-90">
              Close
            </button>
          </div>
          {check.strayFiles.length === 0 && check.missingFiles.length === 0 && (
            <p className="mt-1 text-green-700">✓ The S3 folder and the database match.</p>
          )}
          {check.strayFiles.length > 0 && (
            <>
              <h4 className="mt-2 font-semibold text-amber-700">
                No database row ({check.strayFiles.length} file{check.strayFiles.length === 1 ? '' : 's'})
              </h4>
              <table className="mt-1 border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${cellClass} text-left`}>Audio</th>
                    <th className={`${cellClass} text-left`}>File</th>
                    <th className={`${cellClass} text-left`}>Size</th>
                    <th className={`${cellClass} text-left`}>Stored</th>
                    <th className={`${cellClass} text-left`}></th>
                  </tr>
                </thead>
                <tbody>
                  {check.strayFiles.map((f) => (
                    <tr key={f.key}>
                      <td className={cellClass}>
                        <audio src={f.url} controls controlsList="nodownload" preload="none" className="h-8 w-48" />
                      </td>
                      <td className={`${cellClass} font-mono text-xs`} title={f.key}>
                        {fileName(f.key)}
                      </td>
                      <td className={cellClass}>{formatSize(f.size)}</td>
                      <td className={cellClass}>{new Date(f.lastModified).toLocaleString()}</td>
                      <td className={cellClass}>{deleteButton(() => void deleteStray(f), f.key, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {check.missingFiles.length > 0 && (
            <>
              <h4 className="mt-3 font-semibold text-red-600">
                S3 File Missing ({check.missingFiles.length} audio{check.missingFiles.length === 1 ? '' : 's'})
              </h4>
              <table className="mt-1 border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`${cellClass} text-left`}>ID</th>
                    <th className={`${cellClass} text-left`}>Says</th>
                    <th className={`${cellClass} text-left`}>Used by</th>
                    <th className={`${cellClass} text-left`}>File it should have</th>
                    <th className={`${cellClass} text-left`}></th>
                  </tr>
                </thead>
                <tbody>
                  {check.missingFiles.map((a) => (
                    <tr key={a.id}>
                      <td className={cellClass}>{a.id}</td>
                      <td className={cellClass}>{a.text}</td>
                      <td className={cellClass}>{usedBy(a.questionCount)}</td>
                      <td className={`${cellClass} font-mono text-xs`}>{fileName(a.url)}</td>
                      <td className={cellClass}>{deleteButton(() => void deleteAudio(a), String(a.id), a.questionCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {audios === null && !error && <p className="mt-3">Loading…</p>}
      {audios && audios.length === 0 && <p className="mt-3 text-gray-600">No audio matches.</p>}

      {audios && audios.length > 0 && (
        <table className="mt-4 border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${cellClass} text-left`}>ID</th>
              <th className={`${cellClass} text-left`}>Says</th>
              <th className={`${cellClass} text-left`}>Status</th>
              <th className={`${cellClass} text-left`}>Keywords</th>
              <th className={`${cellClass} text-left`}>Voice</th>
              <th className={`${cellClass} text-left`}>Used by</th>
              <th className={`${cellClass} text-left`}>Saved</th>
              <th className={`${cellClass} text-left`}>S3 file</th>
              <th className={`${cellClass} text-left`}>Audio</th>
              <th className={`${cellClass} text-left`}></th>
            </tr>
          </thead>
          <tbody>
            {audios.map((a) => (
              <tr key={a.id}>
                <td className={cellClass}>{a.id}</td>
                <td className={`${cellClass} max-w-xs`}>{a.text}</td>
                <td className={cellClass}>{a.kept ? 'Kept' : <span className="text-gray-500">Not kept</span>}</td>
                <td className={`${cellClass} max-w-[12rem]`}>{a.keywords.join(', ')}</td>
                <td className={`${cellClass} text-xs`}>
                  {a.provider}
                  <div>{a.voice}</div>
                </td>
                <td className={`${cellClass} whitespace-nowrap`}>{usedBy(a.questionCount)}</td>
                <td className={`${cellClass} whitespace-nowrap`}>
                  {new Date(a.createdAt).toLocaleString()}
                  {a.createdBy && <div className="text-xs text-gray-500">{a.createdBy}</div>}
                </td>
                <td className={`${cellClass} font-mono text-xs`} title={s3Key(a.url)}>
                  {fileName(a.url)}
                </td>
                <td className={cellClass}>
                  <audio src={a.url} controls controlsList="nodownload" preload="none" className="h-8 w-48" />
                </td>
                <td className={`${cellClass} whitespace-nowrap`}>
                  <button
                    type="button"
                    onClick={() => void downloadWav(a)}
                    disabled={converting !== null}
                    title="Download this S3 file as a WAV (converted from its MP3)"
                    className="my-1 mr-2 rounded bg-blue-600 px-2 font-bold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {converting === a.id ? 'Converting…' : 'Download WAV'}
                  </button>
                  {deleteButton(() => void deleteAudio(a), String(a.id), a.questionCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function usedBy(n: number): string {
  return n === 0 ? 'no question' : `${n} question${n === 1 ? '' : 's'}`;
}

function fileName(keyOrUrl: string): string {
  return keyOrUrl.slice(keyOrUrl.lastIndexOf('/') + 1);
}

// The S3 key in an audio's public URL (https://<bucket>.s3.<region>.amazonaws.com/<key>).
function s3Key(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    return url;
  }
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const cellClass = 'border-b border-[var(--border)] px-2 py-1';

const inputClass = 'rounded border border-gray-300 p-1.5';

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90 disabled:opacity-50';
