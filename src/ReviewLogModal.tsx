import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';

// Every multiple-choice answer a student gave in the vocabulary review, newest
// first, practice repeats of missed cards included (GET /cards/review-log).

type Result = 'correct' | 'wrong' | 'dont_know' | 'timeout';

interface LogRow {
  id: number;
  answeredAt: string;
  cardId: number;
  text: string; // the word
  partOfSpeech: string;
  definition: string; // the correct definition
  result: Result;
  chosenDefinition: string; // the wrong option picked (wrong answers only)
  latencyMs: number; // options shown -> answer
  quality: number; // SM-2 grade 0..5
  graded: boolean; // false = practice repeat of a missed card (schedule unchanged)
  intervalDays: number; // the card's interval after this answer
  easiness: number;
  timeLimitMs: number; // the limits when answering
  fastAnswerMs: number;
}

const RESULT_LABEL: Record<Result, string> = {
  correct: '✓ Correct',
  wrong: '✗ Wrong',
  dont_know: "I don't know",
  timeout: 'Timed out',
};

// The response time, colored the way it was graded: fast (green), slower but in
// time (amber), over the limit (red). Wrong / "I don't know" answers aren't
// graded on time, so they stay plain.
function latencyClass(r: LogRow) {
  if (r.result === 'timeout') return 'text-red-600';
  if (r.result !== 'correct') return '';
  return r.latencyMs < r.fastAnswerMs ? 'text-green-700' : 'text-amber-600';
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');

export function ReviewLogModal({ userId, username, onClose }: { userId: number; username: string; onClose: () => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [wordFilter, setWordFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ entries: LogRow[]; limit: number }>(`/cards/review-log?userId=${userId}`, token)
      .then((data) => {
        if (cancelled) return;
        setRows(data.entries);
        setLimit(data.limit);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the review log.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filter = wordFilter.trim().toLowerCase();
  const shown = rows ? (filter ? rows.filter((r) => r.text.toLowerCase().includes(filter)) : rows) : [];
  const correct = shown.filter((r) => r.result === 'correct');
  const fast = correct.filter((r) => r.latencyMs < r.fastAnswerMs);
  const medianMs = median(correct.map((r) => r.latencyMs));
  const gradedCount = shown.filter((r) => r.graded).length;

  return (
    // Backdrop: clicking outside the panel closes the modal.
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-log-heading"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 text-left shadow-[var(--shadow)]"
      >
        <div className="flex items-center justify-between">
          <h2 id="review-log-heading" className="m-0 text-xl">
            Review Log for {username}
          </h2>
          <button onClick={onClose} className={buttonClass}>
            Close
          </button>
        </div>

        {error ? (
          <p className="m-0 text-red-600" role="alert">
            ⚠️ {error}
          </p>
        ) : rows === null ? (
          <p className="m-0">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="m-0">No review answers yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <input
                value={wordFilter}
                onChange={(e) => setWordFilter(e.target.value)}
                placeholder="Filter by word"
                aria-label="Filter by word"
                className="rounded border border-gray-300 p-1.5"
              />
              <span>
                {shown.length} answers ({gradedCount} graded, {shown.length - gradedCount} practice)
              </span>
              <span>Correct: {pct(correct.length, shown.length)}</span>
              <span>Fast: {pct(fast.length, shown.length)}</span>
              <span>Median time (correct): {medianMs === null ? '—' : `${(medianMs / 1000).toFixed(1)} s`}</span>
            </div>
            <p className="m-0 text-sm text-gray-500">
              Time is from the options appearing to the answer. Correct within the "fast" mark = grade 5, correct but
              slower = grade 4, "I don't know" = 2, wrong or over the time limit = 1. Practice rows are repeats of a
              missed card in the same session; they don't change the schedule.
              {rows.length >= limit && ` Showing the latest ${limit} answers only.`}
            </p>

            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['When', 'Word', 'Result', 'Time', 'Grade', 'Counted', 'Next interval'].map((h) => (
                    <th key={h} className={`${cellClass} text-left`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className={`${cellClass} whitespace-nowrap`}>{new Date(r.answeredAt).toLocaleString()}</td>
                    <td className={cellClass}>
                      <span className="font-semibold">{r.text}</span>{' '}
                      <span className="italic text-gray-500">{r.partOfSpeech}</span>
                    </td>
                    <td className={cellClass}>
                      <div className={r.result === 'correct' ? 'text-green-700' : 'text-red-600'}>
                        {RESULT_LABEL[r.result] ?? r.result}
                      </div>
                      {r.result === 'wrong' && r.chosenDefinition && (
                        <div className="text-sm text-gray-500">Picked: "{r.chosenDefinition}"</div>
                      )}
                    </td>
                    <td className={`${cellClass} whitespace-nowrap ${latencyClass(r)}`}>
                      {(r.latencyMs / 1000).toFixed(1)} s
                      <div className="text-xs text-gray-500">
                        fast &lt; {r.fastAnswerMs / 1000} s, limit {r.timeLimitMs / 1000} s
                      </div>
                    </td>
                    <td className={cellClass}>{r.quality}</td>
                    <td className={cellClass}>{r.graded ? 'Graded' : 'Practice'}</td>
                    <td className={`${cellClass} whitespace-nowrap`}>
                      {r.graded ? `${r.intervalDays} day${r.intervalDays === 1 ? '' : 's'}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

const cellClass = 'border-b border-[var(--border)] px-2 py-1';
const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 hover:opacity-90';
