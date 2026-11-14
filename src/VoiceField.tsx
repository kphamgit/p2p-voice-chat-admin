import { useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from './api';
import { TtsPickers } from './TtsControls';
import { useTtsChoice } from './useTts';

// A generated voice in the item form: the question's Audio, and its Trailing
// audio. You type what the voice says, pick a voice and speed, and Generate
// voice. The server stores the MP3 in a pending folder and returns its URL to
// play here; saving the item keeps it (and deletes the voice it replaces),
// closing without saving leaves the saved audio as it was. Generate again for
// another take.

export interface VoiceValue {
  audio: string | null; // the saved MP3's URL, or a voice just generated (only kept if the item is saved with it)
  text: string; // what the voice says
  // The voice that spoke `audio` (its id): set when a voice is generated,
  // cleared with the audio. Picking another voice in the dropdown doesn't
  // change it until that voice is generated.
  voiceName: string | null;
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
  savedAudio: string | null; // the item's saved URL, null for a new item or none saved
  isEdit: boolean; // editing a saved item (shows a note that editing the text doesn't redo the voice)
  initialVoice?: string | null; // the voice the dropdown starts on (the one it was saved with)
  // Set (for formats that offer it) to offer "same as question text"; the
  // form saves this as the text while that's checked.
  questionText?: string;
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
  savedAudio,
  isEdit,
  initialVoice,
  questionText,
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
  const { audio, voiceName } = value;
  const linked = questionText !== undefined && value.sameAsQuestion;
  const text = linked ? questionText : value.text;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const generateVoice = async () => {
    setGenerating(true);
    onGeneratingChange(true);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>('/question-items/audio', token, {
        method: 'POST',
        body: { text: text.trim(), ...tts.request },
      });
      setValue((v) => ({ ...v, audio: url, voiceName: tts.request.voice }));
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
          placeholder={linked ? 'The question text, once it\'s filled in' : placeholder}
          className={`${inputClass} ${linked ? 'bg-gray-50 text-gray-600' : ''}`}
        />
      </label>
      {questionText !== undefined && (
        <label className="flex items-center gap-2 font-normal">
          <input
            type="checkbox"
            checked={value.sameAsQuestion}
            // Unchecking keeps the question text in the field, to edit from there.
            onChange={(e) => {
              const sameAsQuestion = e.target.checked;
              setValue((v) => ({ ...v, sameAsQuestion, text: sameAsQuestion ? v.text : questionText }));
            }}
          />
          same as question text
        </label>
      )}
      {isEdit && (
        <span className="text-sm font-normal text-gray-500">
          Note: changing the {noun} text doesn't change the {noun}. Click Generate voice to update it, then Save.
        </span>
      )}
      {/* Read-only: the voice of the generated audio, saved as its id. */}
      <div className={labelClass}>
        <span className="text-sm font-normal text-gray-500">Voice name (the voice of the {noun}, set when you generate)</span>
        <div className="flex flex-wrap items-baseline gap-x-2 rounded border border-gray-200 bg-gray-50 p-2 text-[var(--text-h)]">
          {audio && voiceName ? (
            <>
              <code className="text-sm">{voiceName}</code>
              {tts.voiceLabel(voiceName) && <span className="text-sm text-gray-500">{tts.voiceLabel(voiceName)}</span>}
            </>
          ) : (
            <span className="text-sm text-gray-500">{audio ? 'Not recorded' : `No ${noun}`}</span>
          )}
        </div>
      </div>
      <TtsPickers choice={tts} labelClass={labelClass} hintClass="text-sm font-normal text-gray-500" inputClass={inputClass} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generateVoice} disabled={!text.trim() || !tts.voice || generating} className={buttonClass}>
          {generating ? 'Generating…' : 'Generate voice'}
        </button>
        {audio && (
          <button
            type="button"
            onClick={() => setValue((v) => ({ ...v, audio: null, voiceName: null }))}
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
            key={audio}
            src={audio}
            controls
            autoPlay={audio !== savedAudio}
            crossOrigin="anonymous"
            onError={() => setAudioFailed(audio)}
            className="w-full"
          />
          {audioFailed === audio && (
            <span className="text-sm text-red-600">
              ⚠️ The audio file couldn't be loaded from S3. If every voice fails, check that the bucket policy makes
              question-audios/* publicly readable.
            </span>
          )}
          {audio !== savedAudio && (
            <span className="text-sm font-normal text-gray-500">
              New voice: Save to keep it{savedAudio ? ' (it replaces the saved one)' : ''}, or Generate voice again for another take.
              Remove {noun} is only for when you want the question to have no {noun} at all.
            </span>
          )}
        </>
      )}
      {!audio && savedAudio && (
        <span className="text-sm font-normal text-gray-500">The saved {noun} will be removed when you Save.</span>
      )}
    </div>
  );
}
