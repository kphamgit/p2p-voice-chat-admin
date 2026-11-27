// Item types shared by the item groups page, the items page and the item form.

// What kind of items an item group holds; it decides which fields its items get.
export const ITEM_TYPES = ['text', 'question'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

// How an item group's items are presented (backend enum ItemDisplayType).
export const DISPLAY_TYPES = ['scrolling', 'individual_screen'] as const;
export type ItemDisplayType = (typeof DISPLAY_TYPES)[number];

// A question item's format (QuestionItem.format on the backend): its number and display name.
export const QUESTION_FORMATS = [
  { value: 1, label: 'Cloze' },
  { value: 2, label: 'Button Cloze' },
  { value: 3, label: 'Button Select' },
  { value: 6, label: 'Words Scramble' },
  { value: 7, label: 'Voice Answer' },
  { value: 8, label: 'Words Select' },
  { value: 9, label: 'Shadowing' },
] as const;

// A question item as returned by the backend's /question-items and
// /item-groups/:id/question-items endpoints.
// A question audio (the server's Audio table): one generated MP3, public at
// `url` (in the audio library, audios/library/), never changed. Questions point
// to one by id and may share it; the kept ones are searchable for reuse.
export interface Audio {
  id: number;
  url: string;
  text: string; // what it says (words only)
  ttsText: string; // the SSML / tagged text it was generated from, '' when that's just `text`
  provider: string; // google | elevenlabs
  voice: string; // the provider's voice id
  speed: number | null; // the speaking rate asked for, null for the default
  kept: boolean; // chosen for reuse: searchable, never deleted automatically
  keywords: string[];
  createdAt: string;
}

// What an audio says, as the server keeps it (Audio.text): the words only,
// any <tag> removed, spaces collapsed. A Shadowing's audio must say its
// question text by this measure.
export function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface QuestionItem {
  id: number;
  itemNumber: number;
  questionText: string | null;
  questionPrompt: string | null;
  answerKey: string | null;
  choices: string | null;
  format: number;
  media: string | null; // text with inline images, ![](<url>)
  audio: Audio | null; // the question's audio (required for format 9, saying the question text)
  trailingAudio: Audio | null; // a second audio, played once the question is answered right
  explanation: string | null;
  showExplanationWhenCorrect: boolean; // explanation also after a correct answer
  checkOrder: boolean; // only applies to format 8 (Words Select)
  halfHandsFree: boolean; // only applies to format 7 (Voice Answer): the mic starts by itself after the question's audio
  hideText: boolean; // only applies to format 9 (Shadowing): the sentence stays hidden until the student has tried it from the audio
  scoringOptions: ScoringOptions | null; // only applies to format 9 (Shadowing): how the student's recording is scored
  itemGroupId: number;
}

// A Shadowing question's (format 9) scoring options, saved as the
// phuyenenglish.com teacher panel's Scoring options send them to VoiceAnalyzer.
export type StressSource = 'dictionary' | 'reference';

export interface ScoringOptions {
  targeted_words: string; // words that should link to the next one, e.g. "is" (is_a)
  helper_words?: Record<string, string>; // display only: { targeted word (lower case): helper word }, shown to the student under that word's link, e.g. { have: "vờ" }
  strict_connected_speech: boolean; // check linking (always on when targeted_words is set)
  link_tolerance?: number; // no longer used or saved (the link checker's limits are fixed); older questions may still have it
  stress_words: string; // "accept, apology": the words whose syllable stress is checked
  stress_words_ipa?: string; // display only: their American IPA, as JSON text {"apology": "əˈpɑlədʒi"} (older: "word: ipa, ...")
  stress_words_viet?: string; // display only: their Vietnamese pronunciation code, syllables separated by hyphens, as JSON text {"apology": "ơ-pô-lơ-di"}
  stress_contrast_ratio: number; // share of the reference's stressed/unstressed contrast the student must reach
  melody_min_similarity: number; // how closely each stress word's melody must follow the reference's
  stress_source: StressSource; // who decides the right stressed syllable
  fall_match_ratio: number; // paused check (sent as its default)
  rise_match_ratio: number; // paused check (sent as its default)
}

// The teacher panel's defaults (phuyenenglish.com, shadowing/evaluation.ts).
export const DEFAULT_FALL_MATCH_RATIO = 0.75;
export const DEFAULT_RISE_MATCH_RATIO = 0.5;
export const LINK_MAX_PAUSE_MS = 80; // the pause allowed between linked words (the link checker's fixed limit)
export const DEFAULT_STRESS_CONTRAST_RATIO = 0.6;
export const DEFAULT_MELODY_MIN_SIMILARITY = 0.35;
export const DEFAULT_STRESS_SOURCE: StressSource = 'dictionary';
// Paused checks, as in the teacher panel: their sliders are hidden and their defaults are saved.
export const RISING_TONE_ENABLED = false;
export const LEGACY_STRESS_ENABLED = false;

// A text item as returned by the backend's /item-groups/:id/text-items endpoint.
export interface TextItem {
  id: number;
  itemNumber: number;
  content: string;
  media: string | null; // optional text with inline media
  itemGroupId: number;
}
