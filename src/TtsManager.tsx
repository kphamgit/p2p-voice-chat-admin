import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetchBlob } from './api';
import { TtsPickers } from './TtsControls';
import { useTtsChoice } from './useTts';
import { toWav16kMono, wavFileName } from './wav';

// Try out text-to-speech: type a sentence, pick a provider (Google Chirp 3 HD
// or ElevenLabs), a voice and a speed, and hear it (POST /tts returns MP3).
// Nothing is stored; the item form has its own generator that saves to the
// question. Download WAV saves what you hear as a 16 kHz mono WAV (the format
// Azure Pronunciation Assessment takes), converted in the browser.

export function TtsManager() {
  const { token } = useAuth();
  const tts = useTtsChoice(token);
  const [text, setText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [audio, setAudio] = useState<{ blob: Blob; url: string; sentence: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const audioUrl = audio?.url ?? null;

  // Free the previous recording's memory when it's replaced or the tab closes.
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const speak = async () => {
    setSpeaking(true);
    setSpeakError(null);
    try {
      const blob = await apiFetchBlob('/tts', token, { method: 'POST', body: { text: text.trim(), ...tts.request } });
      setAudio({ blob, url: URL.createObjectURL(blob), sentence: text.trim() });
    } catch (err) {
      setSpeakError(err instanceof Error ? err.message : 'Text-to-speech failed.');
    } finally {
      setSpeaking(false);
    }
  };

  const downloadWav = async () => {
    if (!audio) return;
    setConverting(true);
    setSpeakError(null);
    try {
      const url = URL.createObjectURL(await toWav16kMono(audio.blob));
      const link = document.createElement('a');
      link.href = url;
      link.download = wavFileName(audio.sentence);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setSpeakError(`Converting to WAV failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4 p-5 text-left">
      <h2 className="text-2xl">TTS Manager</h2>

      <label className={labelClass}>
        Sentence
        <input
          className={inputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim() && tts.voice && !speaking) speak();
          }}
          placeholder="e.g. I am a student."
        />
      </label>

      <TtsPickers choice={tts} labelClass={labelClass} hintClass="" inputClass={inputClass} />

      <div className="flex items-center gap-3">
        <button onClick={speak} disabled={!text.trim() || !tts.voice || speaking} className={`${buttonClass} bg-green-600 text-white`}>
          {speaking ? 'Speaking…' : 'Speak'}
        </button>
        {audioUrl && <audio key={audioUrl} src={audioUrl} controls autoPlay />}
        {audio && (
          <button
            onClick={downloadWav}
            disabled={converting}
            className={buttonClass}
            title="Save this audio as a 16 kHz mono WAV (the format Azure takes)"
          >
            {converting ? 'Converting…' : 'Download WAV'}
          </button>
        )}
      </div>
      {speakError && (
        <p className="text-red-600" role="alert">
          ⚠️ {speakError}
        </p>
      )}
    </div>
  );
}

const labelClass = 'flex flex-col gap-1';
const inputClass = 'rounded border border-gray-300 p-2';
const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';

export default TtsManager;
