import { useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';

// Copies the dictionary (entries, parts of speech, senses, idioms, examples)
// from the Django app's database into this server's (POST /dictionary/sync).
// Django is where the dictionary is edited: Preview shows what would change,
// Sync makes this server's copy match Django's exactly. Look up shows a word's
// entry in the Vietnamese (Hồ Ngọc Đức) dictionary as stored here
// (GET /dictionary/entries), e.g. to check a sync.

interface TableChanges {
  table: string;
  new: number;
  changed: number;
  deleted: number;
}
interface SyncResult {
  tables: TableChanges[];
  applied: boolean; // false for a preview, or when everything was already in sync
}

// A word's entry as GET /dictionary/entries returns it (one per source).
interface Example {
  id: number;
  exampleNumber: number;
  sentence: string | null;
  translation: string | null;
  grammarPoint: string | null;
}
interface Sense {
  id: number;
  senseNumber: number;
  definition: string | null;
  defTranslation: string | null;
  crossReference: string | null;
  grammar: string | null;
  relatedWords: string | null;
  examples: Example[];
}
interface PartOfSpeech {
  id: number;
  name: string;
  pronCode: string | null;
  amevarPron: string | null;
  vietPronCode: string | null;
  frequency: string | null;
  grammar: string | null;
  senses: Sense[];
  idioms: { id: number; phrase: string | null; translation: string | null }[];
}
interface DictEntry {
  id: number;
  headWord: string;
  hyphenated: string;
  source: string | null;
  partOfSpeeches: PartOfSpeech[];
}

// Look up only searches this source: the Vietnamese dictionary.
const VIET_SOURCE = 'ho-ngoc-duc-stardict';

export function DictionaryManager() {
  const { token } = useAuth();
  const [busy, setBusy] = useState<'preview' | 'sync' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The last result, and whether it came from a preview or a sync.
  const [result, setResult] = useState<{ kind: 'preview' | 'sync'; data: SyncResult; at: Date } | null>(null);

  const run = async (kind: 'preview' | 'sync') => {
    if (kind === 'sync' && !window.confirm("Overwrite this server's dictionary with Django's?")) return;
    setBusy(kind);
    setError(null);
    try {
      const data = await apiFetch<SyncResult>('/dictionary/sync', token, {
        method: 'POST',
        body: { dryRun: kind === 'preview' },
      });
      setResult({ kind, data, at: new Date() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setBusy(null);
    }
  };

  const [word, setWord] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // The word looked up and its entries (null before the first look-up).
  const [found, setFound] = useState<{ word: string; entries: DictEntry[] } | null>(null);

  const lookUp = async () => {
    const w = word.trim();
    setLookingUp(true);
    setLookupError(null);
    try {
      const entries = await apiFetch<DictEntry[]>(`/dictionary/entries?word=${encodeURIComponent(w)}&source=${VIET_SOURCE}`, token);
      setFound({ word: w, entries });
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Look-up failed.');
    } finally {
      setLookingUp(false);
    }
  };

  const total = (t: TableChanges) => t.new + t.changed + t.deleted;
  const inSync = result?.data.tables.every((t) => total(t) === 0);

  return (
    <div className="flex max-w-2xl flex-col gap-4 p-5 text-left">
      <h2 className="text-2xl">Manage Viet Dictionary</h2>
      <p className="m-0">
        The dictionary is edited in the Django app. <strong>Sync</strong> copies it here, adding, updating and deleting
        rows so this copy matches Django's exactly. <strong>Preview</strong> shows what a sync would change, without
        changing anything.
      </p>

      <div className="flex items-center gap-2">
        <button onClick={() => run('preview')} disabled={busy !== null} className={buttonClass}>
          {busy === 'preview' ? 'Checking…' : 'Preview'}
        </button>
        <button onClick={() => run('sync')} disabled={busy !== null} className={`${buttonClass} bg-green-600 text-white`}>
          {busy === 'sync' ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {error && (
        <p className="m-0 text-red-600" role="alert">
          ⚠️ {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="m-0 font-semibold">
            {inSync
              ? 'Already in sync: nothing to change.'
              : result.kind === 'preview'
                ? 'Preview: a sync would make these changes.'
                : 'Synced: these changes were made.'}{' '}
            <span className="font-normal text-gray-500">({result.at.toLocaleTimeString()})</span>
          </p>
          <table className="border-collapse">
            <thead>
              <tr>
                {['Table', 'New', 'Changed', 'Deleted'].map((h) => (
                  <th key={h} className="border border-gray-300 px-3 py-1 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.tables.map((t) => (
                <tr key={t.table} className={total(t) ? 'font-semibold' : 'text-gray-500'}>
                  <td className="border border-gray-300 px-3 py-1">{t.table}</td>
                  <td className="border border-gray-300 px-3 py-1 text-right">{t.new}</td>
                  <td className="border border-gray-300 px-3 py-1 text-right">{t.changed}</td>
                  <td className="border border-gray-300 px-3 py-1 text-right">{t.deleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-4 mb-0 text-xl">Look up</h3>
      <p className="m-0 text-sm text-gray-500">Searches the Vietnamese dictionary (Hồ Ngọc Đức) only.</p>
      <div className="flex items-center gap-2">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && word.trim() && !lookingUp) lookUp();
          }}
          placeholder="A word, e.g. record"
          aria-label="Word to look up"
          className="flex-1 rounded border border-gray-300 p-2"
        />
        <button onClick={lookUp} disabled={!word.trim() || lookingUp} className={buttonClass}>
          {lookingUp ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      {lookupError && (
        <p className="m-0 text-red-600" role="alert">
          ⚠️ {lookupError}
        </p>
      )}

      {found &&
        (found.entries.length === 0 ? (
          <p className="m-0">
            No entry for <strong>{found.word}</strong> in the Vietnamese dictionary here. If it's in Django, a sync will bring it over.
          </p>
        ) : (
          found.entries.map((entry) => <EntryView key={entry.id} entry={entry} />)
        ))}
    </div>
  );
}

// One entry: its parts of speech, each with numbered senses (and their
// examples) and idioms.
function EntryView({ entry }: { entry: DictEntry }) {
  return (
    <section className="rounded border border-gray-300 p-3">
      <h4 className="m-0 text-lg">
        {entry.headWord}
        {entry.hyphenated && entry.hyphenated !== entry.headWord && (
          <span className="font-normal text-gray-500"> ({entry.hyphenated})</span>
        )}
      </h4>
      <p className="m-0 text-sm text-gray-500">
        Source: {entry.source ?? 'none'} · entry id {entry.id}
      </p>
      {entry.partOfSpeeches.map((pos) => (
        <div key={pos.id} className="mt-3">
          <p className="m-0">
            <strong className="italic">{pos.name}</strong>
            {pos.pronCode && <span> /{pos.pronCode}/</span>}
            {pos.amevarPron && <span className="text-gray-500"> (US /{pos.amevarPron}/)</span>}
            {pos.grammar && <span className="text-gray-500"> [{pos.grammar}]</span>}
            {pos.frequency && <span className="text-gray-500"> · {pos.frequency}</span>}
          </p>
          {pos.vietPronCode && <p className="m-0 text-sm text-gray-500">Vietnamese pronunciation: {pos.vietPronCode}</p>}
          <ol className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
            {pos.senses.map((sense, i) => (
              <li key={sense.id}>
                <span className="font-semibold">{sense.senseNumber || i + 1}.</span>{' '}
                {sense.grammar && <span className="text-gray-500">[{sense.grammar}] </span>}
                {sense.definition}
                {sense.defTranslation && <div className="ml-5 text-gray-600">{sense.defTranslation}</div>}
                {sense.crossReference && <div className="ml-5 text-sm text-gray-500">See: {sense.crossReference}</div>}
                {sense.relatedWords && <div className="ml-5 text-sm text-gray-500">Related: {sense.relatedWords}</div>}
                {sense.examples.length > 0 && (
                  <ul className="ml-5 mb-0 mt-1 pl-4">
                    {sense.examples.map((ex) => (
                      <li key={ex.id}>
                        <span className="italic">{ex.sentence}</span>
                        {ex.translation && <span className="text-gray-600"> — {ex.translation}</span>}
                        {ex.grammarPoint && <span className="text-sm text-gray-500"> ({ex.grammarPoint})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {pos.idioms.length > 0 && (
            <div className="mt-2">
              <p className="m-0 font-semibold">Idioms</p>
              <ul className="m-0 pl-5">
                {pos.idioms.map((idiom) => (
                  <li key={idiom.id}>
                    <strong>{idiom.phrase}</strong>
                    {idiom.translation && <span className="text-gray-600"> — {idiom.translation}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';

export default DictionaryManager;
