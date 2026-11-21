import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch, apiFetchBlob } from './api';
import { toWav16kMono } from './wav';

// Score students' recordings with TonePerfect or Azure, to compare the two:
// pick a student, listen to their recordings (stored in S3 under
// audios/recordings/), choose one, type what they were meant to say, pick a
// provider's tab and Assess (POST /speech-assessment/assess). Each
// TonePerfect assessment uses up one of the account's tries, so results are
// kept on this page (until it's reloaded) to look at again for free.

interface StudentSummary {
  student: string;
  count: number;
  latest: string; // ISO
}

interface Recording {
  key: string;
  student: string;
  recordedAt: string; // ISO, when it was stored in S3
  size: number; // bytes
  url: string; // presigned, valid for an hour
}

type Provider = 'toneperfect' | 'azure';

const PROVIDERS: { id: Provider; label: string; button: string }[] = [
  {
    id: 'toneperfect',
    label: 'TonePerfect',
    button: 'Assess with TonePerfect (uses 1 try)',
  },
  { id: 'azure', label: 'Azure', button: 'Assess with Azure' },
];

// The server's summary of an assessment (src/assessmentSummary.ts), the same
// shape for both providers.
interface SoundSummary {
  expected: string; // IPA
  heard: string | null; // heard instead, when it differs
  score: number | null;
}
interface WordSummary {
  text: string;
  score: number | null;
  status: 'ok' | 'flagged' | 'omitted' | 'inserted';
  sounds: SoundSummary[];
}
interface AssessmentSummary {
  overall: number | null;
  scores: { label: string; value: number | null }[];
  heard: string | null;
  words: WordSummary[];
  notes: string[];
}

interface Assessment {
  id: number;
  provider: Provider;
  key: string;
  text: string;
  at: Date;
  summary?: AssessmentSummary;
  raw?: unknown; // the provider's reply, as is
  error?: string;
}

// Recordings shown at first, and added by each Show more.
const PAGE = 50;

const fileName = (key: string) => key.split('/').pop() ?? key;
const when = (iso: string) => new Date(iso).toLocaleString();
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function SpeechAssessment() {
  const { token } = useAuth();
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [student, setStudent] = useState('');
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Recording | null>(null);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [assessing, setAssessing] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [provider, setProvider] = useState<Provider>('toneperfect');
  const [downloading, setDownloading] = useState<string | null>(null); // the key of the recording being converted

  // Saves the recording as a 16 kHz mono WAV (converted in the browser), named after it.
  const downloadWav = async (r: Recording) => {
    setDownloading(r.key);
    setError(null);
    try {
      const recording = await apiFetchBlob(`/speech-assessment/audio?key=${encodeURIComponent(r.key)}`, token);
      const url = URL.createObjectURL(await toWav16kMono(recording));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(r.key).replace(/\.[a-z0-9]+$/i, '') + '.wav';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(`Downloading ${fileName(r.key)} as WAV failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(null);
    }
  };

  useEffect(() => {
    apiFetch<StudentSummary[]>('/speech-assessment/students', token)
      .then(setStudents)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Loading the students failed.'));
  }, [token]);

  const pickStudent = async (name: string) => {
    setStudent(name);
    setRecordings(null);
    setShown(PAGE);
    setError(null);
    if (!name) return;
    setLoading(true);
    try {
      setRecordings(
        await apiFetch<Recording[]>(`/speech-assessment/recordings?student=${encodeURIComponent(name)}`, token),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loading the recordings failed.');
    } finally {
      setLoading(false);
    }
  };

  const assess = async () => {
    if (!selected || !text.trim() || assessing) return;
    const entry: Assessment = {
      id: Date.now(),
      provider,
      key: selected.key,
      text: text.trim(),
      at: new Date(),
    };
    setAssessing(true);
    try {
      const reply = await apiFetch<{
        summary: AssessmentSummary;
        raw: unknown;
      }>('/speech-assessment/assess', token, {
        method: 'POST',
        body: {
          key: entry.key,
          text: entry.text,
          provider,
          language: language.trim() || 'en-US',
        },
      });
      entry.summary = reply.summary;
      entry.raw = reply.raw;
    } catch (err) {
      entry.error = err instanceof Error ? err.message : 'The assessment failed.';
    } finally {
      setAssessments((list) => [entry, ...list]);
      setAssessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 text-left">
      <h2 className="text-2xl">Speech Assessment</h2>
      <p className="text-sm text-gray-500">
        Students' recordings, scored by TonePerfect or Azure.
        Each TonePerfect assessment uses up one of the account's tries.
      </p>

      {error && (
        <p className="text-red-600" role="alert">
          ⚠️ {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recordings */}
        <section className="flex min-w-0 flex-col gap-3">
          <label className={labelClass}>
            Student
            <select
              value={student}
              onChange={(e) => void pickStudent(e.target.value)}
              disabled={!students}
              className={inputClass}
            >
              <option value="">{students ? 'Choose a student…' : 'Loading…'}</option>
              {students?.map((s) => (
                <option key={s.student} value={s.student}>
                  {s.student} ({s.count}, latest {new Date(s.latest).toLocaleDateString()})
                </option>
              ))}
            </select>
          </label>

          {loading && <p>Loading recordings…</p>}
          {recordings && recordings.length === 0 && <p>No recordings.</p>}
          {recordings && recordings.length > 0 && (
            <>
              <p className="text-sm text-gray-500">
                {recordings.length} recording
                {recordings.length === 1 ? '' : 's'}, newest first.
              </p>
              <ul className="flex flex-col gap-2">
                {recordings.slice(0, shown).map((r) => {
                  const isSelected = selected?.key === r.key;
                  return (
                    <li
                      key={r.key}
                      className={`flex flex-col gap-1 rounded border p-2 ${
                        isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          <strong>{when(r.recordedAt)}</strong> · {kb(r.size)}
                          <span className="ml-2 break-all text-gray-500">{fileName(r.key)}</span>
                        </span>
                        <span className="flex gap-2">
                          <button
                            onClick={() => setSelected(r)}
                            disabled={isSelected}
                            className={`${buttonClass} ${isSelected ? '' : 'bg-blue-600 text-white'}`}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                          <button
                            onClick={() => downloadWav(r)}
                            disabled={downloading === r.key}
                            className={buttonClass}
                            title="Save this recording as a 16 kHz mono WAV (the format Azure takes)"
                          >
                            {downloading === r.key ? 'Converting…' : 'Download WAV'}
                          </button>
                        </span>
                      </div>
                      <audio controls preload="none" src={r.url} className="w-full" />
                    </li>
                  );
                })}
              </ul>
              {shown < recordings.length && (
                <button onClick={() => setShown((n) => n + PAGE)} className={buttonClass}>
                  Show more ({recordings.length - shown} left)
                </button>
              )}
            </>
          )}
        </section>

        {/* Assessment */}
        <section className="flex min-w-0 flex-col gap-3">
          <h3 className="text-xl">Assess</h3>
          {selected ? (
            <div className="flex flex-col gap-1 rounded border border-gray-300 p-2 text-sm">
              <span>
                <strong>{selected.student}</strong> · {when(selected.recordedAt)}
                <span className="ml-2 break-all text-gray-500">{fileName(selected.key)}</span>
              </span>
              <audio controls preload="none" src={selected.url} className="w-full" />
            </div>
          ) : (
            <p className="text-gray-500">Select a recording on the left.</p>
          )}
          <label className={labelClass}>
            What the student was meant to say
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="e.g. I think this is a very good idea."
              className={`${inputClass} resize-y`}
            />
          </label>
          {/* One tab per provider; the recording and sentence above are shared. */}
          <div className="flex gap-1 border-b border-[var(--border)]">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`-mb-px rounded-t border px-4 py-2 ${
                  provider === p.id
                    ? 'border-[var(--border)] border-b-[var(--bg)] bg-[var(--bg)] font-semibold text-[var(--text-h)]'
                    : 'border-transparent hover:text-[var(--text-h)]'
                }`}
              >
                {p.label} ({assessments.filter((a) => a.provider === p.id).length})
              </button>
            ))}
          </div>
          {provider === 'toneperfect' ? (
            <label className={labelClass}>
              Language
              <input value={language} onChange={(e) => setLanguage(e.target.value)} className={`${inputClass} w-40`} />
            </label>
          ) : (
            <p className="text-sm text-gray-500">Language: en-US. The recording is converted to WAV for Azure.</p>
          )}
          <div>
            <button
              onClick={() => void assess()}
              disabled={!selected || !text.trim() || assessing}
              className={`${buttonClass} bg-green-600 text-white`}
            >
              {assessing ? 'Assessing…' : PROVIDERS.find((p) => p.id === provider)!.button}
            </button>
          </div>

          {assessments
            .filter((a) => a.provider === provider)
            .map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded border border-gray-300 p-3 text-sm">
                <span className="text-gray-500">
                  <strong className="text-[var(--text-h)]">{fileName(a.key)}</strong> · {a.at.toLocaleTimeString()}
                </span>
                {a.error ? (
                  <p className="text-red-600">⚠️ {a.error}</p>
                ) : (
                  a.summary && <SummaryView summary={a.summary} text={a.text} raw={a.raw} />
                )}
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}

export default SpeechAssessment;

// A score's color: green from 80, amber from 60, red below.
const scoreColor = (score: number | null) =>
  score === null ? 'text-gray-500' : score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-600' : 'text-red-600';

// Sounds worth pointing out: heard as another sound, or scored under 60.
const soundProblems = (w: WordSummary) => w.sounds.filter((s) => s.heard || (s.score !== null && s.score < 60));

// An assessment, readable: the overall and other scores, the sentence with
// each word colored by its score, the words that need work with the sounds
// that went wrong, what was heard, and the provider's notes and full reply.
function SummaryView({ summary, text, raw }: { summary: AssessmentSummary; text: string; raw: unknown }) {
  const problems = summary.words.filter(
    (w) => w.status === 'flagged' || w.status === 'omitted' || (w.score !== null && w.score < 80),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`text-3xl font-semibold ${scoreColor(summary.overall)}`}>{summary.overall ?? '–'}</span>
        <span className="text-gray-500">overall</span>
        {summary.scores.map((s) => (
          <span key={s.label}>
            {s.label} <strong className={scoreColor(s.value)}>{s.value ?? '–'}</strong>
          </span>
        ))}
      </div>

      <p className="text-lg leading-relaxed">
        {summary.words.length === 0
          ? text
          : summary.words.map((w, i) => (
              <span key={i}>
                {i > 0 && ' '}
                <span
                  title={`${w.status}${w.score === null ? '' : `, ${w.score}`}`}
                  className={
                    w.status === 'omitted'
                      ? 'text-gray-400 line-through'
                      : w.status === 'inserted'
                        ? 'text-gray-400 italic'
                        : `font-semibold ${scoreColor(w.score)} ${w.status === 'flagged' ? 'underline decoration-wavy' : ''}`
                  }
                >
                  {w.status === 'inserted' ? `[+${w.text}]` : w.text}
                </span>
              </span>
            ))}
      </p>
      <p className="text-xs text-gray-500">
        Green 80+, amber 60–79, red under 60; wavy underline: flagged; crossed out: not said; [+word]: extra word.
      </p>

      {problems.length > 0 && (
        <table className="w-full text-left">
          <thead className="text-gray-500">
            <tr>
              <th className="py-1 pr-3 font-normal">Word</th>
              <th className="py-1 pr-3 font-normal">Score</th>
              <th className="py-1 font-normal">Sounds</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((w, i) => (
              <tr key={i} className="border-t border-gray-200 align-top">
                <td className="py-1 pr-3">
                  {w.text}
                  {w.status === 'flagged' && <span className="ml-1 text-xs text-red-600">flagged</span>}
                </td>
                <td className={`py-1 pr-3 ${scoreColor(w.score)}`}>
                  {w.status === 'omitted' ? 'not said' : (w.score ?? '–')}
                </td>
                <td className="py-1">
                  {soundProblems(w).length === 0
                    ? '–'
                    : soundProblems(w).map((s, j) => (
                        <span key={j} className="mr-3 inline-block">
                          /{s.expected}/{s.heard && <> → /{s.heard}/</>}{' '}
                          <span className={scoreColor(s.score)}>({s.score ?? '–'})</span>
                        </span>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary.heard && (
        <p>
          <span className="text-gray-500">Heard:</span> {summary.heard}
        </p>
      )}
      {summary.notes.map((n, i) => (
        <p key={i} className="text-xs text-gray-500">
          {n}
        </p>
      ))}
      <details>
        <summary className="cursor-pointer text-gray-500">Full reply (JSON)</summary>
        <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-900">
          {typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const labelClass = 'flex flex-col gap-1';

const inputClass = 'rounded border border-gray-300 p-2 font-[inherit]';

const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';
