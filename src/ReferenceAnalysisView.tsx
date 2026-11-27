import { Fragment } from 'react';

// What VoiceAnalyzer measures in a Shadowing question's audio alone for one
// stress word (POST /audios/:id/analyze → VoiceAnalyzer's
// /api/analyze-reference), shown under the word's field in the item form's
// Scoring options ("Analyze reference audio"). Copied from phuyenenglish.com
// (components/shadowing/ReferenceAnalysisView.tsx, and the chart and stress
// marks from EvaluationView.tsx).

export interface ReferenceSyllable {
  syllable_index: number;
  pitch_hz: number;
  intensity_db: number;
  duration_sec: number;
  prominence: number;
  level: string; // "High" / "Low"
  contrast: number | null; // from the expected stressed syllable (null for that syllable)
}

export interface ReferenceMelody {
  status: 'measured' | 'flat' | 'not_measured';
  anchor_syllable: number;
  range_st: number | null;
  contour: number[]; // semitones from the stressed syllable, points_per_syllable per kept syllable
  contour_syllables: number[]; // the syllable number of each block of points
  points_per_syllable: number;
  message: string;
}

export interface ReferenceWordAnalysis {
  word: string;
  status: 'measured' | 'single_syllable' | 'not_measured' | 'not_in_sentence';
  message: string;
  syllable_count?: number;
  reference_stressed_syllable?: number | null;
  reference_pattern?: string | null; // e.g. "○ ●"
  dictionary_stressed_syllable?: number | null;
  dictionary_pattern?: string | null;
  dictionary_reason?: string | null; // why the reference decides in dictionary mode
  stress_source?: 'dictionary' | 'reference' | null; // what an assessment would use
  expected_stressed_syllable?: number | null;
  expected_pattern?: string | null;
  syllables?: ReferenceSyllable[];
  melody?: ReferenceMelody | null;
  hyphenated?: string[] | null; // the syllables as spelled (added by the server), e.g. ["ac", "cept"]
  syllabified?: Syllabified; // the IPA syllables (and Vietnamese code), display only
}

// A stress word's IPA syllables (from the teacher's IPA, else the dictionary), with the
// Vietnamese pronunciation code split at its hyphens; each syllable's `viet` only when the
// counts match.
export interface Syllabified {
  source: 'ipa' | 'cmu' | null; // the teacher's IPA, or made from the CMU dictionary
  ipa: string | null; // the teacher's IPA as sent
  cmu_syllable_count: number | null; // the syllables the analyzer measures in the audio
  matches_cmu: boolean | null;
  syllabified: string | null; // e.g. "ə-ˈpɑ-lə-dʒi"
  syllables: { text: string; stress: 'primary' | 'secondary' | null; viet?: string }[];
  viet: string | null;
  viet_source?: 'client' | 'cmu' | null; // the teacher's code, or made from the CMU dictionary
  viet_syllables: string[];
  viet_matches_ipa: boolean | null;
}

export interface ReferenceAnalysis {
  status: string;
  reference_stress_pattern: string;
  stress_source: 'dictionary' | 'reference';
  words: ReferenceWordAnalysis[];
}

export function ReferenceAnalysisView({ analysis: a }: { analysis: ReferenceWordAnalysis }) {
  if (a.status !== 'measured') {
    return <p className="m-0 text-sm text-amber-700">{a.message}</p>;
  }
  const disagree = a.dictionary_stressed_syllable != null && a.dictionary_stressed_syllable !== a.reference_stressed_syllable;
  const used = a.stress_source === 'dictionary' ? "the dictionary's" : "the reference audio's";
  // Syllables are named by their spelling (“cept”), as in the students' results; by number
  // only when the dictionary's split doesn't fit.
  const parts = a.hyphenated && a.hyphenated.length === a.syllable_count ? a.hyphenated : null;
  const name = (n: number | null | undefined) =>
    n != null && parts?.[n - 1] ? `“${parts[n - 1]}”` : `the ${ordinal(n)} syllable`;
  return (
    <div className="flex flex-col gap-1 rounded border border-gray-300 bg-white p-2 text-sm text-gray-800">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-1">
        <div>
          <span className="text-gray-500">Reference audio:</span>{' '}
          <StressPattern pattern={a.reference_pattern} tone={disagree ? 'amber' : 'green'} />
          {parts && <Spelled parts={parts} stressed={a.reference_stressed_syllable} />}
        </div>
        <div>
          <span className="text-gray-500">Dictionary:</span>{' '}
          {a.dictionary_stressed_syllable != null ? (
            <>
              <StressPattern pattern={a.dictionary_pattern} tone="green" />
              {parts && <Spelled parts={parts} stressed={a.dictionary_stressed_syllable} />}
            </>
          ) : (
            <span className="text-gray-500">can't decide ({a.dictionary_reason})</span>
          )}
        </div>
      </div>
      {a.syllabified && a.syllabified.syllables.length > 0 && <Pronunciation s={a.syllabified} />}
      {disagree && (
        <p className="m-0 text-amber-700">
          The reference audio stresses {name(a.reference_stressed_syllable)}, but the dictionary stresses{' '}
          {name(a.dictionary_stressed_syllable)}. With the current option, students are expected to stress {used}{' '}
          choice: {name(a.expected_stressed_syllable)}.
        </p>
      )}
      {a.syllables && a.syllables.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {a.syllables.map((s) => (
            <span
              key={s.syllable_index}
              title={`${Math.round(s.pitch_hz)} Hz · ${s.intensity_db} dB · ${s.duration_sec} s · prominence ${s.prominence}`}
              className={`rounded px-1.5 py-0.5 ${
                s.syllable_index === a.reference_stressed_syllable ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-700'
              }`}
            >
              {parts ? parts[s.syllable_index - 1] : ordinal(s.syllable_index)}: {s.level}
            </span>
          ))}
        </div>
      )}
      {a.melody && (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
          {/* The same chart as the students' results, with the reference's curve only. */}
          {a.melody.contour.length > 1 && (
            <ContourChart
              reference={a.melody.contour}
              perSyllable={a.melody.points_per_syllable}
              syllables={a.melody.contour_syllables}
              parts={parts}
            />
          )}
          <div className="min-w-48 flex-1">
            <span className="text-gray-500">Melody{a.melody.status === 'flat' ? ' (flat)' : ''}:</span>{' '}
            {parts ? spellSyllables(a.melody.message, parts) : a.melody.message}
            {a.melody.status === 'measured' && a.melody.contour.length > 1 && (
              <div className="text-xs text-gray-500">
                Pitch of the reference, from the stressed{' '}
                {parts ? name(a.melody.anchor_syllable) : `${ordinal(a.melody.anchor_syllable)} syllable`} (dashed line,
                as in the students' results).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// The IPA syllables, each with its Vietnamese code part underneath (when the counts match), the
// stressed one in bold; a warning when the Vietnamese code has a different number of parts.
function Pronunciation({ s }: { s: Syllabified }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-end gap-x-1">
        <span className="mr-1 self-start text-gray-500">
          Pronunciation:
        </span>
        {s.syllables.map((syl, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="self-start text-gray-400">-</span>}
            <span className="inline-flex flex-col items-center leading-tight">
              <span lang="und-fonipa" className={syl.stress === 'primary' ? 'font-bold text-gray-900' : ''}>
                {syl.stress === 'primary' ? 'ˈ' : syl.stress === 'secondary' ? 'ˌ' : ''}
                {syl.text}
              </span>
              {syl.viet && (
                <span lang="vi" className={`text-xs text-gray-600 ${syl.stress === 'primary' ? 'font-bold' : ''}`}>
                  {syl.viet}
                </span>
              )}
            </span>
          </Fragment>
        ))}
      </div>
      <span className="text-xs text-gray-500">
        IPA: {s.source === 'ipa' ? 'yours' : 'made from the CMU dictionary (type one to replace it)'}
      </span>
      {s.source === 'ipa' && s.matches_cmu === false && (
        <p className="m-0 text-amber-700">
          Your IPA has {s.syllables.length} syllable{s.syllables.length === 1 ? '' : 's'}, but the analyzer splits this
          word into {s.cmu_syllable_count} (the CMU dictionary's count), so the labels won't line up with the melody
          chart and students won't see them there.
        </p>
      )}
      {s.viet && s.viet_matches_ipa && (
        <span className="text-xs text-gray-500">
          Vietnamese: {s.viet_source === 'client' ? 'yours' : 'made from the CMU dictionary (type one to replace it)'}
        </span>
      )}
      {s.viet && s.viet_matches_ipa === false && (
        <p className="m-0 text-amber-700">
          Vietnamese{s.viet_source === 'client' ? '' : ' (made from the CMU dictionary)'}:{' '}
          <span lang="vi">{s.viet}</span>. Its parts don't line up with the {s.syllables.length} IPA syllables, so
          students see it on its own line.{s.viet_source === 'client' ? ' Use one part per syllable, separated by hyphens.' : ''}
        </p>
      )}
    </div>
  );
}

// The word as spelled syllables, e.g. ac-cept, with the stressed one in bold.
function Spelled({ parts, stressed }: { parts: string[]; stressed: number | null | undefined }) {
  return (
    <div className="text-xs text-gray-700">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && '-'}
          {i + 1 === stressed ? <strong className="text-gray-900">{p}</strong> : p}
        </Fragment>
      ))}
    </div>
  );
}

// A stress pattern such as "○ ● ○" as numbered circles: the stressed syllable filled, in green
// (matches) or amber (doesn't).
function StressPattern({ pattern, tone }: { pattern?: string | null; tone: 'green' | 'amber' }) {
  const marks = (pattern ?? '').trim().split(/\s+/).filter(Boolean);
  if (marks.length === 0) return <span>–</span>;
  return (
    <span className="mr-1 inline-flex gap-0.5 align-middle">
      {marks.map((m, i) => (
        <span
          key={i}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold leading-none ${
            m !== '●'
              ? 'border-gray-500 bg-white text-gray-700'
              : tone === 'green'
                ? 'border-green-700 bg-green-600 text-white'
                : 'border-amber-600 bg-amber-500 text-white'
          }`}
          title={`Syllable ${i + 1}${m === '●' ? ' (stressed)' : ''}`}
        >
          {i + 1}
        </span>
      ))}
    </span>
  );
}

// The reference's pitch curve (semitones) on a small chart, dashed grey, with a light line
// between syllables and each syllable underneath (its spelling, or its number).
function ContourChart({
  reference,
  perSyllable,
  syllables,
  parts = null,
}: {
  reference: number[];
  perSyllable: number;
  syllables: number[];
  parts?: string[] | null;
}) {
  const W = 180;
  const H = 64;
  const pad = 4;
  const lo = Math.min(...reference);
  const hi = Math.max(...reference);
  const span = Math.max(hi - lo, 1);
  const n = reference.length;
  const x = (i: number) => pad + (i / Math.max(n - 1, 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - 2 * pad - 10);
  const path = reference.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pitch curve of the reference">
      {syllables.map((num, k) => {
        const x0 = x(k * perSyllable);
        const x1 = x(Math.min((k + 1) * perSyllable, n) - 1);
        return (
          <g key={k}>
            {k > 0 && <line x1={x0} x2={x0} y1={pad} y2={H - 12} stroke="#e5e7eb" />}
            <text x={(x0 + x1) / 2} y={H - 2} fontSize="10" fontWeight="600" textAnchor="middle" fill="#1f2937">
              {parts?.[num - 1] ?? num}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#9ca3af" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
}

function ordinal(n: number | null | undefined): string {
  if (n == null) return '?';
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// The analyzer's melody message names syllables by number ("from the 1st syllable"); this puts
// their spelling in instead ("from “ac”").
function spellSyllables(message: string, parts: string[]): string {
  return message.replace(/\bthe (\d+)(?:st|nd|rd|th) syllable\b/g, (whole, n: string) => {
    const part = parts[Number(n) - 1];
    return part ? `“${part}”` : whole;
  });
}
