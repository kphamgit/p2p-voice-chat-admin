import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from './api';
import type { Audio } from './item';
import { Toast } from './Toast';
import { TtsPickers } from './TtsControls';
import { useTtsChoice } from './useTts';

// The voice generator in an item form's audio section (see AudioField): type
// what the voice says (or follow the question text), pick a voice and speed,
// and Generate voice. The server keeps each voice it generates as an audio
// (POST /audios); the question uses it once saved with it, and a voice nobody
// uses is deleted after a day. Generate again for another take.

export interface VoiceValue {
  // The question's audio: the saved one, one just generated, or one picked
  // from the library (only kept if the item is saved with it).
  audio: Audio | null;
  text: string; // the text to generate from (the audio itself carries what it says)
  // When "same as question text" is offered (Button Select, Voice Answer) and
  // checked: the voice says the question text, so the text field follows it
  // instead of being typed in.
  sameAsQuestion: boolean;
}

interface Props {
  title: string; // e.g. "Audio (optional)"
  noun: string; // e.g. "audio", "trailing audio": used in the hints
  placeholder: string;
  value: VoiceValue;
  setValue: Dispatch<SetStateAction<VoiceValue>>;
  savedAudioId: number | null; // the item's saved audio, null for a new item or none saved
  isEdit: boolean; // editing a saved item (shows a note that editing the text doesn't redo the voice)
  initialVoice?: string | null; // the voice the dropdown starts on (the one it was saved with)
  // Set (for formats that offer it) to offer "same as question text": the
  // voice is generated from the question text while that's checked.
  questionText?: string;
  // The question can't be saved without this audio (Shadowing): no Remove button.
  required?: boolean;
  // The voice always says the question text (Shadowing): no text field or
  // "same as question text" box. Needs questionText.
  textIsQuestion?: boolean;
  token: string | null;
  setError: (message: string | null) => void;
  onGeneratingChange: (generating: boolean) => void; // so the form can hold Save while a voice is generated
  labelClass: string;
  inputClass: string;
  buttonClass: string;
}

export function VoiceField({
  title,
  noun,
  placeholder,
  value,
  setValue,
  savedAudioId,
  isEdit,
  initialVoice,
  questionText,
  required = false,
  textIsQuestion = false,
  token,
  setError,
  onGeneratingChange,
  labelClass,
  inputClass,
  buttonClass,
}: Props) {
  const tts = useTtsChoice(token, initialVoice);
  const [generating, setGenerating] = useState(false);
  const [audioFailed, setAudioFailed] = useState<string | null>(null); // the audio URL that wouldn't load
  const { audio } = value;
  const isNew = audio !== null && audio.id !== savedAudioId;
  // After Generate voice: the audio just stored, for the toast saying where.
  const [stored, setStored] = useState<Audio | null>(null);
  const hideStored = useCallback(() => setStored(null), []);
  const linked = questionText !== undefined && (textIsQuestion || value.sameAsQuestion);
  const text = linked ? questionText : value.text;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const generateVoice = async () => {
    setGenerating(true);
    onGeneratingChange(true);
    setError(null);
    try {
      const { provider, voice, rate } = tts.request;
      const audio = await apiFetch<Audio>('/audios', token, {
        method: 'POST',
        body: { text: text.trim(), provider, voice, speed: rate },
      });
      setValue((v) => ({ ...v, audio }));
      setStored(audio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generating the voice failed.');
    } finally {
      setGenerating(false);
      onGeneratingChange(false);
    }
  };

  return (
    // A div, not a <label>: it holds several inputs and buttons.
    <div className={`${labelClass} rounded border border-gray-300 p-3`}>
      {title}
      {!textIsQuestion && (
        <label className={labelClass}>
          <span className="text-sm font-normal text-gray-500">{Noun} text: what the voice says</span>
          <input
            value={text}
            onChange={(e) => {
              const text = e.target.value;
              setValue((v) => ({ ...v, text }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim() && tts.voice && !generating) generateVoice();
            }}
            readOnly={linked}
            placeholder={linked ? "The question text, once it's filled in" : placeholder}
            className={`${inputClass} ${linked ? 'bg-gray-50 text-gray-600' : ''}`}
          />
        </label>
      )}
      {questionText !== undefined && !textIsQuestion && (
        <label className="flex items-center gap-2 font-normal">
          <input
            type="checkbox"
            checked={value.sameAsQuestion}
            // Unchecking keeps the question text in the field, to edit from there.
            onChange={(e) => {
              const sameAsQuestion = e.target.checked;
              setValue((v) => ({
                ...v,
                sameAsQuestion,
                text: sameAsQuestion ? v.text : questionText,
              }));
            }}
          />
          same as question text
        </label>
      )}
      {isEdit && (
        <span className="text-sm font-normal text-gray-500">
          Note: changing the {textIsQuestion ? 'question' : noun} text doesn't change the {noun}. Click Generate voice
          to update it, then Save.
        </span>
      )}
      {/* Read-only: the voice of the audio, kept as its id. */}
      <div className={labelClass}>
        <span className="text-sm font-normal text-gray-500">
          Voice name (the voice of the {noun}, set when you generate)
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2 rounded border border-gray-200 bg-gray-50 p-2 text-[var(--text-h)]">
          {audio ? (
            <>
              <code className="text-sm">{audio.voice}</code>
              <span className="text-sm text-gray-500">
                {[tts.voiceLabel(audio.voice), audio.speed && audio.speed !== 1 ? `${audio.speed}×` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-500">No voice name yet</span>
          )}
        </div>
      </div>
      <TtsPickers
        choice={tts}
        labelClass={labelClass}
        hintClass="text-sm font-normal text-gray-500"
        inputClass={inputClass}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generateVoice}
          disabled={!text.trim() || !tts.voice || generating}
          className={buttonClass}
        >
          {generating ? 'Generating…' : 'Generate voice'}
        </button>
        {audio && !required && (
          <button
            type="button"
            onClick={() => setValue((v) => ({ ...v, audio: null }))}
            disabled={generating}
            className={buttonClass}
          >
            Remove {noun}
          </button>
        )}
      </div>
      {audio && (
        <>
          {/* crossOrigin for the same reason as the media images. */}
          <audio
            key={audio.url}
            src={audio.url}
            controls
            autoPlay={isNew}
            crossOrigin="anonymous"
            onError={() => setAudioFailed(audio.url)}
            className="w-full"
          />
          {audioFailed === audio.url && (
            <span className="text-sm text-red-600">
              ⚠️ The audio file couldn't be loaded from S3. If every voice fails, check that the bucket policy makes
              the audio folder publicly readable: question-audios/*, or dev/question-audios/* for a development
              server (S3_PREFIX=dev/).
            </span>
          )}
          {isNew && (
            <span className="text-sm font-normal text-gray-500">
              New {noun}: Save to keep it
              {savedAudioId ? ' (it replaces the saved one)' : ''}, or Generate voice again for another take.
              {!required && ` Remove ${noun} is only for when you want the question to have no ${noun} at all.`}
            </span>
          )}
        </>
      )}
      {!audio && savedAudioId && (
        <span className="text-sm font-normal text-gray-500">The saved {noun} will be removed when you Save.</span>
      )}
      {stored && (
        <Toast key={stored.id} onDone={hideStored}>
          Voice stored in S3 storage as <span className="font-mono break-all text-gray-200">{s3Path(stored.url)}</span>. Saving
          the question will point its {noun} to this file.
        </Toast>
      )}
    </div>
  );
}

// "dev/question-audios/<uuid>.mp3": an audio's place in the bucket, from its public URL.
function s3Path(url: string): string {
  return url.replace(/^https:\/\/[^/]+\//, '');
}
