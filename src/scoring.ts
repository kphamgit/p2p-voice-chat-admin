import {
  DEFAULT_FALL_MATCH_RATIO,
  DEFAULT_LINK_TOLERANCE,
  DEFAULT_MELODY_MIN_SIMILARITY,
  DEFAULT_RISE_MATCH_RATIO,
  DEFAULT_STRESS_CONTRAST_RATIO,
  DEFAULT_STRESS_SOURCE,
  LEGACY_STRESS_ENABLED,
  RISING_TONE_ENABLED,
  type ScoringOptions,
  type StressSource,
} from './item';

// A Shadowing question's Scoring options while the item form edits them (see
// ShadowingScoringOptions). Stress words are one field each; they're saved
// joined as "accept, apology".
export interface ScoringForm {
  targetedWords: string;
  strictConnectedSpeech: boolean;
  linkTolerance: number;
  stressWordList: string[];
  stressContrastRatio: number;
  melodyMinSimilarity: number;
  stressSource: StressSource;
  fallMatchRatio: number;
  riseMatchRatio: number;
}

// The form's starting values: the item's saved options, or the defaults.
export function scoringFormFrom(saved: ScoringOptions | null | undefined): ScoringForm {
  const words = (saved?.stress_words ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
  return {
    targetedWords: saved?.targeted_words ?? '',
    strictConnectedSpeech: saved?.strict_connected_speech ?? false,
    linkTolerance: saved?.link_tolerance ?? DEFAULT_LINK_TOLERANCE,
    stressWordList: words.length ? words : [''],
    stressContrastRatio: saved?.stress_contrast_ratio ?? DEFAULT_STRESS_CONTRAST_RATIO,
    melodyMinSimilarity: saved?.melody_min_similarity ?? DEFAULT_MELODY_MIN_SIMILARITY,
    stressSource: saved?.stress_source ?? DEFAULT_STRESS_SOURCE,
    fallMatchRatio: saved?.fall_match_ratio ?? DEFAULT_FALL_MATCH_RATIO,
    riseMatchRatio: saved?.rise_match_ratio ?? DEFAULT_RISE_MATCH_RATIO,
  };
}

// "accept, apology" from the stress word fields.
export function stressWordsOf(form: ScoringForm): string {
  return form.stressWordList
    .map((w) => w.trim())
    .filter(Boolean)
    .join(', ');
}

// Linking is always checked when targeted words are given.
export function isStrict(form: ScoringForm): boolean {
  return form.strictConnectedSpeech || form.targetedWords.trim() !== '';
}

// The options as saved, exactly as the teacher panel sends them: a hidden
// (paused or not applicable) slider saves its default.
export function scoringOptionsFrom(form: ScoringForm): ScoringOptions {
  const strict = isStrict(form);
  const words = stressWordsOf(form);
  return {
    targeted_words: form.targetedWords.trim(),
    strict_connected_speech: strict,
    link_tolerance: strict ? form.linkTolerance : DEFAULT_LINK_TOLERANCE,
    stress_words: words,
    stress_contrast_ratio: words ? form.stressContrastRatio : DEFAULT_STRESS_CONTRAST_RATIO,
    melody_min_similarity: words ? form.melodyMinSimilarity : DEFAULT_MELODY_MIN_SIMILARITY,
    stress_source: form.stressSource,
    fall_match_ratio: LEGACY_STRESS_ENABLED ? form.fallMatchRatio : DEFAULT_FALL_MATCH_RATIO,
    rise_match_ratio: RISING_TONE_ENABLED ? form.riseMatchRatio : DEFAULT_RISE_MATCH_RATIO,
  };
}
