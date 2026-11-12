import { useMemo } from 'react';
import type { TtsChoice, TtsVoice } from './useTts';

// Provider, voice and speed dropdowns for text-to-speech, shared by the TTS
// Manager tab and the item form's voice generator (state: useTtsChoice).
export function TtsPickers({
  choice,
  labelClass,
  hintClass,
  inputClass,
}: {
  choice: TtsChoice;
  labelClass: string;
  hintClass: string; // the small caption above each dropdown
  inputClass: string;
}) {
  const { providers, provider, providerId, voice, speeds, rate, error } = choice;
  const groups = useMemo(() => {
    const byGroup = new Map<string, TtsVoice[]>();
    for (const v of provider?.voices ?? []) byGroup.set(v.group, [...(byGroup.get(v.group) ?? []), v]);
    return [...byGroup]; // in the server's order
  }, [provider]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <label className={labelClass}>
          <span className={hintClass}>Provider</span>
          <select
            className={inputClass}
            value={providerId}
            onChange={(e) => choice.setProviderId(e.target.value as typeof providerId)}
            disabled={!providers.length}
          >
            {!providers.length && <option value={providerId}>Loading…</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} min-w-48 flex-1`}>
          <span className={hintClass}>Voice</span>
          <select
            className={inputClass}
            value={voice}
            onChange={(e) => choice.setVoice(e.target.value)}
            disabled={!provider?.voices.length}
          >
            {!provider?.voices.length && <option value="">{error ? 'Voices unavailable' : 'Loading voices…'}</option>}
            {groups.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={hintClass}>Speed</span>
          <select className={inputClass} value={rate} onChange={(e) => choice.setRate(Number(e.target.value))}>
            {speeds.map((s) => (
              <option key={s} value={s}>
                {s === 1 ? '1× (normal)' : `${s}×`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <span className="text-sm text-red-600">⚠️ {error}</span>}
    </>
  );
}
