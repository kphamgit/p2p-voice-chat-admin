import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// The text-to-speech choice (provider, voice, speed) behind the TTS Manager
// tab and the item form's voice generator. The providers and their voices
// come from GET /tts/voices.

export type TtsProviderId = 'google' | 'elevenlabs';

export interface TtsVoice {
  id: string; // sent as `voice`
  label: string; // e.g. "Charon (male)", "River - Relaxed, Neutral, Informative"
  group: string; // e.g. "English (US)", "Premade"
}

export interface TtsProvider {
  id: TtsProviderId;
  name: string;
  defaultVoice: string;
  minRate: number;
  maxRate: number;
  voices: TtsVoice[];
  error?: string; // instead of voices, when the server couldn't list them
}

// Speeds offered (1 is normal). Learners need slower speech, never faster, so
// nothing above 1; a provider only gets the ones it accepts (ElevenLabs:
// 0.7 and up).
const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

// Short provider marks put before voice names.
export const PROVIDER_TAGS: Record<TtsProviderId, string> = { google: 'GG', elevenlabs: '11L' };

// `initialVoice`: a voice id to start on (e.g. the one a question's audio was
// made with); its provider is selected with it, if any provider has it.
export function useTtsChoice(token: string | null, initialVoice?: string | null) {
  const [providers, setProviders] = useState<TtsProvider[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The provider picked in the dropdown; until then ElevenLabs, the default,
  // or Google if ElevenLabs isn't available (e.g. no API key on the server).
  const [chosenProvider, setProviderId] = useState<TtsProviderId | null>(null);
  // Voice picked per provider ('' or missing: the provider's default).
  const [chosenVoices, setChosenVoices] = useState<Partial<Record<TtsProviderId, string>>>({});
  const [chosenRate, setRate] = useState(1);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ providers: TtsProvider[] }>('/tts/voices', token)
      .then((data) => {
        if (!cancelled) setProviders(data.providers);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load voices.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const initialProvider = initialVoice
    ? providers.find((p) => p.voices.some((v) => v.id === initialVoice))?.id
    : undefined;
  const providerId: TtsProviderId =
    chosenProvider ??
    initialProvider ??
    (providers.find((p) => p.id === 'elevenlabs')?.error ? 'google' : 'elevenlabs');
  const provider = providers.find((p) => p.id === providerId);
  const voice =
    chosenVoices[providerId] ||
    (providerId === initialProvider ? initialVoice : null) ||
    provider?.defaultVoice ||
    '';
  const speeds = SPEEDS.filter((s) => !provider || (s >= provider.minRate && s <= provider.maxRate));
  // A speed the new provider doesn't offer (0.5 when switching to
  // ElevenLabs) becomes its slowest one.
  const rate = speeds.includes(chosenRate) ? chosenRate : (speeds[0] ?? 1);

  return {
    providers,
    provider,
    providerId,
    setProviderId,
    voice,
    setVoice: (id: string) => setChosenVoices((v) => ({ ...v, [providerId]: id })),
    speeds,
    rate,
    setRate,
    error: loadError ?? provider?.error ?? null,
    // The label of any provider's voice, marked with its provider, e.g.
    // "11L River - Relaxed, Neutral, Informative" or "GG Charon (male)".
    voiceLabel: (id: string) => {
      for (const p of providers) {
        const v = p.voices.find((v) => v.id === id);
        if (v) return `${PROVIDER_TAGS[p.id]} ${v.label}`;
      }
      return null;
    },
    // What to send to /tts or /question-items/audio.
    request: { provider: providerId, voice, rate },
  };
}

export type TtsChoice = ReturnType<typeof useTtsChoice>;
