import { useCallback, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { apiFetch, apiFetchBlob } from './api';
import { LibraryHelpModal } from './LibraryHelpModal';
import { plainText, type Audio } from './item';
import { useTtsChoice } from './useTts';
import type { VoiceValue } from './VoiceField';
import { toWav16kMono, wavFileName } from './wav';

// One audio section of the question form (the Audio, or the Trailing audio),
// for every format. "Use audio from":
//   - Generate a voice: the voice generator (`children`, a VoiceField), plus
//     "Save to library" to keep a generated voice for other questions
//     (PATCH /audios/:id).
//   - From the library: search it (GET /audios?q=) and check an audio to use
//     it. Questions share library audios (nothing is copied). Unchecking puts
//     back the audio from before.
// Both write the same `value`, so switching between them never drops the audio.

interface Props {
  title: ReactNode; // e.g. "Audio (optional)"
  hint?: string;
  noun: string; // "audio", "trailing audio"
  value: VoiceValue;
  setValue: Dispatch<SetStateAction<VoiceValue>>;
  questionText: string;
  // Shadowing: the audio must say the question text, and picking one from the
  // library makes its text the question text.
  mustSayQuestion?: boolean;
  setQuestionText: (text: string) => void;
  token: string | null;
  inputClass: string;
  buttonClass: string;
  children: ReactNode; // the VoiceField
}

export function AudioField({
  title,
  hint,
  noun,
  value,
  setValue,
  questionText,
  mustSayQuestion = false,
  setQuestionText,
  token,
  inputClass,
  buttonClass,
  children,
}: Props) {
  const { voiceLabel } = useTtsChoice(token);
  const [source, setSource] = useState<'tts' | 'library'>('tts');
  // From the library: the keyword search and its results.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Audio[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Download (as WAV): the audio being converted right now.
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  // The library audio checked, with what the section held before the first
  // pick (and the question text, for Shadowing), put back by unchecking.
  // Checked while the section still holds that audio.
  const [picked, setPicked] = useState<{ id: number; before: { voice: VoiceValue; questionText: string } } | null>(
    null,
  );
  const pickedId = picked && value.audio?.id === picked.id ? picked.id : undefined;
  // Save to library: keywords for it.
  const [keywords, setKeywords] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showLibraryHelp, setShowLibraryHelp] = useState(false);
  const closeLibraryHelp = useCallback(() => setShowLibraryHelp(false), []);

  const mismatch = mustSayQuestion && value.audio && plainText(questionText) !== value.audio.text;

  // "11L River · 0.8×"
  const voiceOf = (audio: Audio) =>
    [voiceLabel(audio.voice)?.split(/ - | \(/)[0] ?? audio.provider, audio.speed && audio.speed !== 1 ? `${audio.speed}×` : '']
      .filter(Boolean)
      .join(' · ');

  const search = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const data = await apiFetch<{ audios: Audio[] }>(`/audios?q=${encodeURIComponent(query.trim())}`, token);
      setResults(data.audios);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Searching the library failed.');
    } finally {
      setSearching(false);
    }
  };

  // Saves an audio as a 16 kHz mono WAV (converted in the browser), named
  // after what it says, e.g. to test it elsewhere later.
  const downloadWav = async (audio: Audio) => {
    if (downloadingId !== null) return;
    setDownloadingId(audio.id);
    setSearchError(null);
    try {
      const mp3 = await apiFetchBlob(`/audios/${audio.id}/file`, token);
      const url = URL.createObjectURL(await toWav16kMono(mp3));
      const link = document.createElement('a');
      link.href = url;
      link.download = wavFileName(audio.text);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setSearchError(err instanceof Error ? `Download failed: ${err.message}` : 'Downloading that audio failed.');
    } finally {
      setDownloadingId(null);
    }
  };

  const changeSource = (next: 'tts' | 'library') => {
    setSource(next);
    if (next === 'library' && results === null) void search();
  };

  const toggle = (audio: Audio) => {
    if (picked && pickedId === audio.id) {
      setValue(picked.before.voice);
      if (mustSayQuestion) setQuestionText(picked.before.questionText);
      setPicked(null);
      return;
    }
    const before = picked && pickedId !== undefined ? picked.before : { voice: value, questionText };
    setPicked({ id: audio.id, before });
    setValue({ audio, text: audio.text, sameAsQuestion: false });
    if (mustSayQuestion) setQuestionText(audio.text);
  };

  const saveToLibrary = async () => {
    const audio = value.audio;
    if (!audio || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await apiFetch<Audio>(`/audios/${audio.id}`, token, {
        method: 'PATCH',
        body: { inLibrary: true, keywords },
      });
      // Only if the section still holds that audio.
      setValue((v) => (v.audio?.id === saved.id ? { ...v, audio: saved } : v));
      setResults(null); // searched again next time, with this one in it
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saving to the library failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    // A div, not a <label>: it holds several inputs and buttons.
    <div className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <span>{title}</span>
      {hint && <span className="text-sm font-normal text-gray-500">{hint}</span>}
      <label className="flex flex-wrap items-center gap-2 font-normal">
        Use audio from
        <select
          value={source}
          onChange={(e) => changeSource(e.target.value as 'tts' | 'library')}
          className={inputClass}
        >
          <option value="tts">Generate a voice</option>
          <option value="library">The library</option>
        </select>
      </label>

      {/* Hidden rather than unmounted in library mode, so its voice choices are kept. */}
      <div className={source === 'tts' ? 'flex flex-col gap-2' : 'hidden'}>
        {children}
        {value.audio &&
          (value.audio.inLibrary ? (
            <span className="text-sm font-normal text-gray-500">This {noun} is in the library.</span>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Keywords, e.g. apology, question intonation"
                  aria-label="Keywords for the library"
                  className={`${inputClass} min-w-0 flex-1 text-sm`}
                />
                <button
                  type="button"
                  onClick={() => void saveToLibrary()}
                  disabled={saving}
                  title="Keep this audio to find and reuse for other questions (From the library)"
                  className={`${buttonClass} text-sm`}
                >
                  {saving ? 'Saving…' : 'Save to Library (database)'}
                </button>
              </div>
              <span className="text-sm font-normal text-gray-500">
                Keeps this {noun} for reuse: any question can pick it from the library, and it's never deleted
                automatically. This question uses it either way.{' '}
                <button
                  type="button"
                  onClick={() => setShowLibraryHelp(true)}
                  className="border-0 bg-transparent p-0 text-sm text-blue-600 underline hover:text-blue-800"
                >
                  Detail
                </button>
              </span>
              {saveError && <span className="text-sm text-red-600">⚠️ {saveError}</span>}
            </div>
          ))}
      </div>

      {source === 'library' && (
        <div className="flex flex-col gap-2 font-normal">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Keyword, e.g. apology"
              aria-label="Search the library"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button type="submit" disabled={searching} className={buttonClass}>
              {searching ? 'Searching…' : 'Search library'}
            </button>
          </form>
          <span className="text-sm text-gray-500">
            Finds the audios that contain every word you type, in what they say or their keywords. Leave it blank to
            list the newest. Check one to use it{mustSayQuestion ? ', and what it says as the question text' : ''}.
          </span>
          {searchError && <span className="text-sm text-red-600">⚠️ {searchError}</span>}
          {results &&
            (results.length === 0 ? (
              <span className="text-sm text-gray-600">Nothing in the library matches.</span>
            ) : (
              <ul className="m-0 flex max-h-72 list-none flex-col gap-2 overflow-y-auto p-0">
                {results.map((audio) => {
                  const checked = pickedId === audio.id;
                  const details = [
                    voiceOf(audio),
                    new Date(audio.createdAt).toLocaleDateString(),
                    audio.keywords.length > 0 ? `keywords: ${audio.keywords.join(', ')}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <li
                      key={audio.id}
                      className={`rounded border p-2 ${checked ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-300'}`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={checked} onChange={() => toggle(audio)} className="mt-1" />
                        <span className="flex flex-col">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[var(--text-h)]">{audio.text}</span>
                            <PlayButton src={audio.url} label={audio.text} />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault(); // inside the row's label: don't tick the checkbox
                                void downloadWav(audio);
                              }}
                              disabled={downloadingId !== null}
                              title="Save this audio as a 16 kHz mono WAV, for testing"
                              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-50"
                            >
                              {downloadingId === audio.id ? 'Converting…' : 'Download'}
                            </button>
                          </span>
                          <span className="text-xs text-gray-500">{details}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ))}
          {value.audio && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-500">
                {pickedId !== undefined ? `The question's ${noun} (from the library):` : `The question's current ${noun}:`}
              </span>
              <audio key={value.audio.url} src={value.audio.url} controls crossOrigin="anonymous" className="w-full" />
            </div>
          )}
        </div>
      )}
      {showLibraryHelp && <LibraryHelpModal onClose={closeLibraryHelp} />}
      {mismatch && (
        <span className="text-sm text-amber-700">
          The {noun} says “{value.audio!.text}”, which isn't the question text. Generate the voice again, or pick
          another {noun}.
        </span>
      )}
    </div>
  );
}

// The audio a PlayButton is playing now, so starting another one stops it.
let playingAudio: HTMLAudioElement | null = null;

// A round play button for an audio in the library list; a second click stops it.
function PlayButton({ src, label }: { src: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = (e: React.MouseEvent) => {
    e.preventDefault(); // the button sits inside the row's label: don't tick the checkbox
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (playingAudio && playingAudio !== audio) playingAudio.pause();
    playingAudio = audio;
    audio.currentTime = 0;
    void audio.play().catch((err) => console.error("Library: can't play the audio:", err));
  };
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? 'Stop' : 'Play'} “${label}”`}
        title={playing ? 'Stop' : 'Play'}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-blue-600 p-0 text-blue-600 hover:bg-blue-50"
      >
        {playing ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1.5" width="3" height="9" />
            <rect x="7" y="1.5" width="3" height="9" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden="true">
            <path d="M2.5 1.2v9.6L10.5 6z" />
          </svg>
        )}
      </button>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}
