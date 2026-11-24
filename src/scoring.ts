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
// joined as "accept, apology". Each word's IPA (optional, display only) is
// kept by the lower-cased word and saved as stress_words_ipa, JSON text; its
// Vietnamese pronunciation code (optional, display only, syllables separated by
// hyphens: "ơ-pô-lơ-di") likewise, as stress_words_viet.
export interface ScoringForm {
  targetedWords: string;
  strictConnectedSpeech: boolean;
  linkTolerance: number;
  stressWordList: string[];
  stressIpa: Record<string, string>; // lower-cased stress word → its American IPA
  stressViet: Record<string, string>; // lower-cased stress word → its Vietnamese pronunciation code
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
    stressIpa: parseStressIpa(saved?.stress_words_ipa),
    stressViet: parseStressIpa(saved?.stress_words_viet),
    stressContrastRatio: saved?.stress_contrast_ratio ?? DEFAULT_STRESS_CONTRAST_RATIO,
    melodyMinSimilarity: saved?.melody_min_similarity ?? DEFAULT_MELODY_MIN_SIMILARITY,
    stressSource: saved?.stress_source ?? DEFAULT_STRESS_SOURCE,
    fallMatchRatio: saved?.fall_match_ratio ?? DEFAULT_FALL_MATCH_RATIO,
    riseMatchRatio: saved?.rise_match_ratio ?? DEFAULT_RISE_MATCH_RATIO,
  };
}

// Saved stress_words_ipa (or stress_words_viet) → { word: ipa }: JSON text, or the older
// "accept: əkˈsɛpt, apology: əˈpɑlədʒi" pairs (as VoiceAnalyzer reads both).
export function parseStressIpa(text: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = (text ?? '').trim();
  if (!raw) return out;
  let pairs: [string, unknown][] = [];
  if (raw.startsWith('{')) {
    try {
      const obj: unknown = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) pairs = Object.entries(obj);
    } catch {
      pairs = [];
    }
  } else {
    pairs = raw
      .split(/[,;\n]+/)
      .map((part) => part.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]);
  }
  for (const [word, ipa] of pairs) {
    const key = word.trim().toLowerCase();
    const value = String(ipa).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

// The stress words' IPA as saved: JSON text of { word: ipa } for the current
// stress words that have one; '' when none do.
export function stressIpaOf(form: ScoringForm): string {
  return wordPairsOf(form, form.stressIpa);
}

// The stress words' Vietnamese pronunciation code as saved, the same way.
export function stressVietOf(form: ScoringForm): string {
  return wordPairsOf(form, form.stressViet);
}

function wordPairsOf(form: ScoringForm, values: Record<string, string>): string {
  const entries = form.stressWordList
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => [w.toLowerCase(), (values[w.toLowerCase()] ?? '').trim()] as const)
    .filter(([, v]) => v !== '');
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : '';
}

// "ơ-pô-lơ-di" → ["ơ", "pô", "lơ", "di"], split as VoiceAnalyzer does.
export function vietParts(code: string): string[] {
  return code
    .split(/[-‐‑–—]/)
    .map((p) => p.trim())
    .filter(Boolean);
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
    stress_words_ipa: stressIpaOf(form),
    stress_words_viet: stressVietOf(form),
    stress_contrast_ratio: words ? form.stressContrastRatio : DEFAULT_STRESS_CONTRAST_RATIO,
    melody_min_similarity: words ? form.melodyMinSimilarity : DEFAULT_MELODY_MIN_SIMILARITY,
    stress_source: form.stressSource,
    fall_match_ratio: LEGACY_STRESS_ENABLED ? form.fallMatchRatio : DEFAULT_FALL_MATCH_RATIO,
    rise_match_ratio: RISING_TONE_ENABLED ? form.riseMatchRatio : DEFAULT_RISE_MATCH_RATIO,
  };
}
