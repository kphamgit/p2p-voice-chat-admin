import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  DEFAULT_FALL_MATCH_RATIO,
  DEFAULT_LINK_TOLERANCE,
  DEFAULT_MELODY_MIN_SIMILARITY,
  DEFAULT_RISE_MATCH_RATIO,
  DEFAULT_STRESS_CONTRAST_RATIO,
  DEFAULT_STRESS_SOURCE,
  LEGACY_STRESS_ENABLED,
  LINK_PAUSE_MARGIN_MS,
  RISING_TONE_ENABLED,
  type Audio,
} from './item';
import { apiFetch } from './api';
import { ReferenceAnalysisView, type ReferenceAnalysis, type ReferenceWordAnalysis } from './ReferenceAnalysisView';
import { isStrict, stressWordsOf, type ScoringForm } from './scoring';

// A Shadowing question's (format 9) Scoring options in the item form, copied
// from the Scoring options of the teacher's Shadowing panel in
// phuyenenglish.com (components/Shadowing.tsx): the same controls, defaults
// and help. They're saved with the question (scoringOptions) and decide how
// close a student's recording must come to the question's audio.
// "Analyze reference audio" next to each stress word has VoiceAnalyzer measure
// the question's audio alone with these options (POST
// /audios/:id/analyze): which syllable it stresses, the
// dictionary's, and the melody. For the teacher's testing; nothing is saved.

interface Props {
  value: ScoringForm;
  setValue: Dispatch<SetStateAction<ScoringForm>>;
  questionText: string; // its words are offered as stress word buttons
  showMissing: boolean; // outline the empty stress word field (after a Save without one)
  audio: Audio | null; // the question's audio, the reference that's analyzed (saying its own text)
  token: string | null;
  inputClass: string;
}

// One stress word's "Analyze reference audio", with what it was made from: only
// shown while the audio and stress source are still those.
interface RefAnalysis {
  audioId: number;
  stressSource: ScoringForm['stressSource'];
  loading: boolean;
  result?: ReferenceWordAnalysis;
  error?: string;
}

export function ShadowingScoringOptions({
  value,
  setValue,
  questionText,
  showMissing,
  audio,
  token,
  inputClass,
}: Props) {
  const [showHelp, setShowHelp] = useState(false);
  // Per stress word (lower-cased).
  const [refAnalyses, setRefAnalyses] = useState<Record<string, RefAnalysis>>({});
  const set = <K extends keyof ScoringForm>(key: K, v: ScoringForm[K]) => setValue((f) => ({ ...f, [key]: v }));
  const strict = isStrict(value);
  const stressWords = stressWordsOf(value);
  const list = value.stressWordList;

  // The question text's words, each once ("I'm", "well-known" kept whole), as pick buttons.
  const sentenceWords = Array.from(
    new Map(
      (questionText.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).map((w) => [w.toLowerCase(), w] as const),
    ).values(),
  );
  const sameWord = (a: string, b: string) => a.trim().toLowerCase() === b.toLowerCase();
  const isStressWord = (word: string) => list.some((w) => sameWord(w, word));
  // Never leaves the list without a field to type in.
  const setStressFields = (next: string[]) => set('stressWordList', next.length > 0 ? next : ['']);
  // A word button puts the word in the first empty field (or a new one), or
  // takes its field out if it's already there.
  const toggleStressWord = (word: string) => {
    if (isStressWord(word)) {
      setStressFields(list.filter((w) => !sameWord(w, word)));
      return;
    }
    const blank = list.findIndex((w) => w.trim() === '');
    setStressFields(blank >= 0 ? list.map((w, i) => (i === blank ? word : w)) : [...list, word]);
  };

  const current = (a: RefAnalysis | undefined) =>
    a && a.audioId === audio?.id && a.stressSource === value.stressSource ? a : null;

  const analyzeReference = async (word: string) => {
    const key = word.trim().toLowerCase();
    if (!key || !audio || current(refAnalyses[key])?.loading) return;
    const made = { audioId: audio.id, stressSource: value.stressSource };
    setRefAnalyses((all) => ({ ...all, [key]: { ...made, loading: true } }));
    try {
      const data = await apiFetch<ReferenceAnalysis>(`/audios/${audio.id}/analyze`, token, {
        method: 'POST',
        body: { stressWords: word.trim(), stressSource: value.stressSource },
      });
      const result = data.words.find((w) => sameWord(w.word, word)) ?? data.words[0];
      setRefAnalyses((all) => ({ ...all, [key]: { ...made, loading: false, result } }));
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Analyzing the reference audio failed.';
      setRefAnalyses((all) => ({ ...all, [key]: { ...made, loading: false, error } }));
    }
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-gray-300 p-3">
      <legend className="px-1">Scoring options</legend>
      <div className="flex flex-wrap items-end gap-4 font-normal">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Targeted words (optional)</span>
          <input
            value={value.targetedWords}
            onChange={(e) => set('targetedWords', e.target.value)}
            placeholder="e.g. is"
            title="Word(s) that should link to the next word, e.g. is → is_a"
            className={`${inputClass} w-48`}
          />
        </label>
        <label
          className="flex items-center gap-2 self-center"
          title={
            value.targetedWords.trim()
              ? 'Linking is always checked when targeted words are given'
              : 'Check that words link to the next word (connected speech)'
          }
        >
          <input
            type="checkbox"
            checked={strict}
            disabled={value.targetedWords.trim() !== ''}
            onChange={(e) => set('strictConnectedSpeech', e.target.checked)}
          />
          Strict connected speech
        </label>
        {/* Only matters when missed links are penalised (strict on, or targeted words given). */}
        {strict && <LinkToleranceSlider value={value.linkTolerance} onChange={(v) => set('linkTolerance', v)} />}
      </div>

      {/* Where the right stressed syllable of each stress word comes from. */}
      <div
        role="radiogroup"
        aria-label="Stress pattern source"
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-normal"
      >
        {(
          [
            ['dictionary', 'Use stress pattern from CMU dictionary'],
            ['reference', 'Use stress pattern from reference audio'],
          ] as const
        ).map(([source, label]) => (
          <label key={source} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="stress-source"
              value={source}
              checked={value.stressSource === source}
              onChange={() => set('stressSource', source)}
            />
            {label}
            {source === DEFAULT_STRESS_SOURCE && <span className="text-gray-500">(default)</span>}
          </label>
        ))}
      </div>
      {value.stressSource === 'dictionary' && (
        <p className="-mt-1 mb-0 text-xs font-normal text-gray-500">
          The reference audio decides only when the dictionary can't: the last word of a Yes/No question, a word that
          isn't in the dictionary, or a word with two stress patterns (record, present).
        </p>
      )}

      {sentenceWords.length > 0 && (
        <div className="flex flex-col gap-1 font-normal">
          <span className="text-sm text-gray-600">Click the words to stress-check (click again to remove):</span>
          <div className="flex flex-wrap gap-1.5">
            {sentenceWords.map((word) => {
              const on = isStressWord(word);
              return (
                <button
                  key={word.toLowerCase()}
                  type="button"
                  onClick={() => toggleStressWord(word)}
                  aria-pressed={on}
                  className={`rounded border px-2 py-1 text-sm ${
                    on
                      ? 'border-blue-700 bg-blue-600 text-white hover:bg-blue-800'
                      : 'border-gray-300 text-[var(--text-h)] hover:bg-gray-100'
                  }`}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 font-normal">
        {/* Word Syllables Stress Check: which syllable is stressed inside each word given here. */}
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-sm">
            Stress words <span className="text-red-600">(required)</span>{' '}
            <span className="text-gray-500">The multi-syllable words checked for syllable stress pattern.</span>
          </legend>
          {list.map((word, i) => {
            const shown = current(refAnalyses[word.trim().toLowerCase()]);
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <input
                    value={word}
                    onChange={(e) =>
                      set(
                        'stressWordList',
                        list.map((w, j) => (j === i ? e.target.value : w)),
                      )
                    }
                    placeholder={i === 0 ? 'e.g. apology' : 'another word'}
                    aria-label={`Stress word ${i + 1}`}
                    title="A multi-syllable word whose syllable stress is checked against the reference (Word Syllables Stress Check)."
                    aria-required={i === 0}
                    className={`${inputClass} w-56 ${showMissing && !stressWords ? 'border-red-600' : ''}`}
                  />
                  {(list.length > 1 || word !== '') && (
                    <button
                      type="button"
                      onClick={() => setStressFields(list.filter((_, j) => j !== i))}
                      aria-label={`Remove stress word ${i + 1}`}
                      title="Remove"
                      className="h-8 w-8 rounded p-0 text-lg leading-none text-gray-500 hover:bg-gray-200 hover:text-gray-900"
                    >
                      ×
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void analyzeReference(word)}
                    disabled={!word.trim() || !audio || shown?.loading}
                    title={
                      !audio
                        ? 'Generate a voice (or pick one from the library) for this question first'
                        : "Measure this word's stressed syllable and melody in the question's audio"
                    }
                    className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
                  >
                    {shown?.loading ? 'Analyzing…' : 'Analyze reference audio'}
                  </button>
                </div>
                {shown?.result && <ReferenceAnalysisView analysis={shown.result} />}
                {shown?.error && <p className="m-0 text-sm text-red-600">⚠️ {shown.error}</p>}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => set('stressWordList', [...list, ''])}
            className="self-start p-0 text-sm text-blue-700 hover:underline"
          >
            + Add a word
          </button>
        </fieldset>
        {stressWords !== '' && (
          <RatioSlider
            label="Stress contrast"
            hint="How much of the reference's contrast between the stressed syllable and the others (within the word) the student must reach. Lower = more lenient."
            value={value.stressContrastRatio}
            defaultValue={DEFAULT_STRESS_CONTRAST_RATIO}
            onChange={(v) => set('stressContrastRatio', v)}
          />
        )}
        {stressWords !== '' && (
          <p className="m-0 self-center text-sm text-gray-500">
            Suggestion: 50–60% for beginners, 75% for most classes, 90–100% for advanced students.
          </p>
        )}
        {stressWords !== '' && (
          <RatioSlider
            label="Melody match"
            suffix="similarity"
            min={0.1}
            max={0.9}
            hint="How closely the student's pitch shape through each stress word must follow the reference's to count as 'Same melody'. Higher = stricter. Shown with the results, not counted in the score."
            value={value.melodyMinSimilarity}
            defaultValue={DEFAULT_MELODY_MIN_SIMILARITY}
            onChange={(v) => set('melodyMinSimilarity', v)}
          />
        )}
        {stressWords !== '' && (
          <p className="m-0 self-center text-sm text-gray-500">Lenient 30–40%, moderate 50%, strict 70% or more.</p>
        )}
        {/* Paused: replaced by the Word Syllables Stress Check (code kept, as in the teacher panel). */}
        {LEGACY_STRESS_ENABLED && (
          <RatioSlider
            label="Falling tone"
            hint="How far an unstressed syllable must drop compared with the reference (e.g. “-ther” in “mother”). Lower = more lenient."
            value={value.fallMatchRatio}
            defaultValue={DEFAULT_FALL_MATCH_RATIO}
            onChange={(v) => set('fallMatchRatio', v)}
          />
        )}
        {/* Paused: sentence-level intonation that spans words (code kept). */}
        {RISING_TONE_ENABLED && (
          <RatioSlider
            label="Rising tone"
            hint="How far the voice must rise at the end of a Yes/No question compared with the reference. Lower = more lenient."
            value={value.riseMatchRatio}
            defaultValue={DEFAULT_RISE_MATCH_RATIO}
            onChange={(v) => set('riseMatchRatio', v)}
          />
        )}
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
          aria-controls="scoring-help"
          className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
        >
          {showHelp ? 'Hide help' : 'Help'}
        </button>
      </div>
      {showHelp && <ScoringHelp onClose={() => setShowHelp(false)} />}
    </fieldset>
  );
}

// How to adjust the scoring options: what each slider checks, which way is
// more lenient, worked examples and suggested values (the teacher panel's
// help, worded for a question item).
function ScoringHelp({ onClose }: { onClose: () => void }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const h = 'm-0 font-semibold text-gray-900';
  return (
    <section
      id="scoring-help"
      aria-label="How to adjust the scoring options"
      className="flex flex-col gap-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm font-normal text-gray-800 [&_p]:m-0"
    >
      <div className="flex items-start justify-between gap-3">
        <p>
          These settings decide how close a student's recording must come to the question's audio (the reference).
          They're saved with this question when you click <strong>Save</strong>, and apply to every student who answers
          it.
        </p>
        <button type="button" onClick={onClose} className="whitespace-nowrap p-0 text-blue-700 hover:underline">
          Close
        </button>
      </div>

      <p className="rounded bg-white px-2 py-1">
        <strong>Which way is easier?</strong> Stress contrast and Melody match: <strong>lower = more lenient</strong>.
        Linking tolerance: <strong>higher = more lenient</strong>.
      </p>

      <div>
        <h5 className={h}>
          Word Syllables Stress Check: Stress words and Stress contrast (default {pct(DEFAULT_STRESS_CONTRAST_RATIO)})
        </h5>
        <p>
          Type the multi-syllable words you want checked in <strong>Stress words</strong>, one per field (or click them
          in the question text). Each word is checked <strong>on its own</strong>: the syllables of the word are
          compared with each other, not with the rest of the sentence. This field is required: the question can't be
          saved until it has at least one word. The <strong>Stress contrast</strong> slider appears once you type a
          word.
        </p>
        <p className="mt-1">
          <strong>Which syllable is right?</strong> With <strong>Use stress pattern from CMU dictionary</strong> (the
          default), the dictionary decides (ac-<strong>CEPT</strong>, a-<strong>POL</strong>-o-gy). The reference audio
          decides only when the dictionary can't: the last word of a Yes/No question (“Do you play basket
          <strong>BALL</strong>?”, where the rising voice often moves the stress), a word that isn't in the dictionary,
          or a word with two stress patterns (<strong>REC</strong>-ord / re-<strong>CORD</strong>). With{' '}
          <strong>Use stress pattern from reference audio</strong>, the syllable the reference voice made strongest is
          always the right one. The results table shows, under <em>Expected</em>, which one decided.
        </p>
        <p className="mt-1">Each word is then judged in two steps:</p>
        <ol className="my-0 ml-5 list-decimal">
          <li>
            <strong>Right syllable:</strong> the student must stress the expected syllable. If not, the word gets{' '}
            <em>✗ Wrong syllable</em> and 0%, with a hint like “Stress the 2nd syllable (○ ●), not the 1st (● ○)”.
          </li>
          <li>
            <strong>Enough contrast:</strong> the other syllables must be lower and softer than the stressed one, by at
            least the <strong>Stress contrast</strong> percentage of the reference's difference. This covers both
            directions: the voice rising into the stress (“ac-” before “-CEPT”) and falling after it (“-ther” after
            “MO-”). If the contrast is too small, the word gets <em>↕ More contrast</em> and 50–99%, depending on how
            close the student came.
          </li>
        </ol>
        <p className="mt-1">Example: in the reference, “ac-” is clearly lower and softer than “-CEPT”.</p>
        <ul className="my-0 ml-5 list-disc">
          <li>At 75%, the student's “ac-” must stand out from “-CEPT” at least 75% as much as the reference's does.</li>
          <li>At 50%, half the reference's contrast is enough.</li>
          <li>At 100%, the student must match the reference's contrast.</li>
        </ul>
        <p className="mt-1">
          Suggested: <strong>50–60%</strong> for beginners, <strong>75%</strong> for most classes,{' '}
          <strong>90–100%</strong> for advanced students. Choose words with a clear stress, and listen to the reference
          first, especially when it decides the stress (Yes/No questions). The word stress score counts for 45% of the
          overall score (pronunciation 55%). With no stress words, the overall score is pronunciation only.
        </p>
      </div>

      <div>
        <h5 className={h}>Melody match (default {pct(DEFAULT_MELODY_MIN_SIMILARITY)})</h5>
        <p>
          For each stress word, the student's pitch curve (the melody) is compared with the reference's by its{' '}
          <strong>shape</strong>: where the voice goes up and down through the word. The result is a similarity from
          −100% (the opposite shape) to 100% (the same shape). At or above the <strong>Melody match</strong> percentage
          the word gets <em>✓ Same melody</em>; below it, the student gets coaching for each syllable (“dy” should go
          higher than “dad”).
        </p>
        <ul className="my-0 ml-5 list-disc">
          <li>
            <strong>30–40%:</strong> lenient. Only a clearly different shape fails.
          </li>
          <li>
            <strong>50%:</strong> moderate.
          </li>
          <li>
            <strong>70% or more:</strong> strict. The shape must follow the reference closely.
          </li>
        </ul>
        <p className="mt-1">
          Shape only: a student with the right shape but a smaller voice movement still passes (with a tip to make the
          rises and falls bigger). Short words where a syllable is too weak to measure are compared on less, so a strict
          setting can fail them on very little. The melody is shown with the results but <strong>not counted</strong> in
          the score.
        </p>
      </div>

      {LEGACY_STRESS_ENABLED && (
        <div>
          <h5 className={h}>Falling tone (default {pct(DEFAULT_FALL_MATCH_RATIO)})</h5>
          <p>
            Checks that the unstressed syllables of a word drop in pitch and loudness, like the reference. In “MOther”,
            the voice should fall on “-ther”. The drop is measured from the word's stressed syllable. If it isn't low
            enough, the student sees <em>↓ Lower pitch</em> on that syllable.
          </p>
          <p className="mt-1">
            The percentage is how much of the reference speaker's drop the student must reach. Example: the reference
            drops 20% in pitch on “-ther”.
          </p>
          <ul className="my-0 ml-5 list-disc">
            <li>At 75%, the student must drop about 15–16%.</li>
            <li>At 55%, about 11% is enough.</li>
            <li>At 100%, they must match the reference's drop.</li>
          </ul>
          <p className="mt-1">
            Suggested: <strong>55–65%</strong> for beginners, <strong>75%</strong> for most classes,{' '}
            <strong>85–100%</strong> for advanced students. It only affects words of two or more syllables.
          </p>
        </div>
      )}

      {RISING_TONE_ENABLED && (
        <div>
          <h5 className={h}>Rising tone (default {pct(DEFAULT_RISE_MATCH_RATIO)})</h5>
          <p>
            Checks that the voice goes <strong>up</strong> at the end of a Yes/No question (“Is she a teacher↗?”), from
            the last important word to the end of the sentence. It is only checked when the reference itself rises
            clearly. Statements and Wh-questions are skipped. A student who stays flat or falls sees{' '}
            <em>↑ Raise your voice at the end</em>. A small rise gets <em>↑ Rise higher at the end</em>.
          </p>
          <p className="mt-1">
            The percentage is how much of the reference's rise the student must reach (there's also a small minimum: 2
            semitones at {pct(DEFAULT_RISE_MATCH_RATIO)}). Example: the reference rises 6 semitones.
          </p>
          <ul className="my-0 ml-5 list-disc">
            <li>At 50%, the student needs a 3-semitone rise.</li>
            <li>At 35%, about 2 semitones is enough.</li>
          </ul>
          <p className="mt-1">
            Suggested: start at <strong>35–40%</strong> for students who rarely raise their voice in questions, and move
            toward 50% as they improve. When this check applies, it counts for 15% of the overall score.
          </p>
        </div>
      )}

      <div>
        <h5 className={h}>
          Linking tolerance (default {DEFAULT_LINK_TOLERANCE}×, shown when Strict connected speech is on)
        </h5>
        <p>
          Checks that words the reference speaker joins smoothly (“is_a”, “mother_is”) are joined by the student too,
          without a pause. With targeted words, only those words and the next word are checked. Otherwise every pair the
          reference links is checked.
        </p>
        <p className="mt-1">The number is how much longer a pause between linked words may be than the reference's:</p>
        <ul className="my-0 ml-5 list-disc">
          <li>1×: up to {LINK_PAUSE_MARGIN_MS} ms extra pause (very strict, a tiny hesitation counts).</li>
          <li>2×: up to {LINK_PAUSE_MARGIN_MS * 2} ms.</li>
          <li>3×: up to {LINK_PAUSE_MARGIN_MS * 3} ms.</li>
        </ul>
        <p className="mt-1">
          Higher values also accept a slightly larger gap and dip in loudness between the words. A missed link costs 25
          points on the first word and 20 on the next. Suggested: <strong>1.5–2×</strong> for most classes. With Strict
          connected speech off, linking isn't checked or shown at all.
        </p>
      </div>

      <p>
        <strong>Tips:</strong> change one setting at a time, and use <em>reset</em> to go back to the default.
      </p>
    </section>
  );
}

// The linking tolerance: how much longer a pause between linked words (e.g.
// "is_a") may be than the reference's, as a multiplier, with the pause it
// allows, its default and a reset.
function LinkToleranceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pauseMs = (v: number) => Math.round(LINK_PAUSE_MARGIN_MS * v);
  return (
    <label
      className="flex flex-col gap-1"
      title="How much longer a pause (or a dip in loudness) between linked words may be than in the reference before it counts as not linked. Higher = more lenient."
    >
      <span className="text-sm">
        Linking tolerance: <strong>{value}×</strong> (extra pause up to {pauseMs(value)} ms){' '}
        <span className="text-gray-500">
          (default {DEFAULT_LINK_TOLERANCE}× / {pauseMs(DEFAULT_LINK_TOLERANCE)} ms)
        </span>
        {value !== DEFAULT_LINK_TOLERANCE && <ResetButton onClick={() => onChange(DEFAULT_LINK_TOLERANCE)} />}
      </span>
      <input
        type="range"
        min={0.5}
        max={3}
        step={0.25}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-48"
      />
    </label>
  );
}

// A threshold as a share of the reference's (shown as a percentage), with its
// default and a reset.
function RatioSlider({
  label,
  hint,
  value,
  defaultValue,
  onChange,
  suffix = 'of reference',
  min = 0.1,
  max = 1,
}: {
  label: string;
  hint: string;
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
  suffix?: string; // after the percentage, e.g. "of reference" or "similarity"
  min?: number;
  max?: number;
}) {
  const pctText = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <label className="flex flex-col gap-1" title={hint}>
      <span className="text-sm">
        {label}: <strong>{pctText(value)}</strong> {suffix}{' '}
        <span className="text-gray-500">(default {pctText(defaultValue)})</span>
        {value !== defaultValue && <ResetButton onClick={() => onChange(defaultValue)} />}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-48"
      />
    </label>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault(); // inside the slider's label
        onClick();
      }}
      className="ml-1 p-0 text-xs text-blue-600 underline"
    >
      reset
    </button>
  );
}
