// Turns audio the browser can play (e.g. the MP3 from POST /tts) into a
// 16 kHz mono 16-bit WAV: the format Azure Pronunciation Assessment takes.
// Done in the browser (Web Audio), so the server needs no ffmpeg. Also
// toWav: the same audio as WAV without resampling ("Download WAV" in the
// Manage Audios Library tab).

const SAMPLE_RATE = 16000;

export async function toWav16kMono(audio: Blob): Promise<Blob> {
  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(await audio.arrayBuffer());
  } finally {
    void decoder.close();
  }
  // Rendering into a one-channel 16 kHz context mixes the channels down and resamples.
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav([rendered.getChannelData(0)], SAMPLE_RATE);
}

// An MP3 as a 16-bit WAV at the MP3's own sample rate (read from its first
// frame) and with its own channels, so nothing is resampled or mixed down.
export async function toWav(mp3: Blob): Promise<Blob> {
  const bytes = await mp3.arrayBuffer();
  const rate = mp3SampleRate(new Uint8Array(bytes)) ?? 44100;
  // An OfflineAudioContext decodes at its own rate; nothing is played.
  const decoded = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
  return encodeWav(channels, decoded.sampleRate);
}

// The sample rate in an MP3's first frame header (after any ID3v2 tag), or null.
function mp3SampleRate(b: Uint8Array): number | null {
  let i = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const size = ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
    i = 10 + size + (b[5]! & 0x10 ? 10 : 0); // + footer
  }
  const rates: Record<number, number[]> = {
    3: [44100, 48000, 32000], // MPEG 1
    2: [22050, 24000, 16000], // MPEG 2
    0: [11025, 12000, 8000], // MPEG 2.5
  };
  for (; i + 2 < b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) continue;
    const version = (b[i + 1]! >> 3) & 0x03;
    const layer = (b[i + 1]! >> 1) & 0x03;
    const rateIndex = (b[i + 2]! >> 2) & 0x03;
    if (version === 1 || layer === 0 || rateIndex === 3) continue;
    return rates[version]![rateIndex]!;
  }
  return null;
}

// A PCM WAV file (16-bit) of these samples (-1 to 1), one array per channel,
// interleaved.
function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const n = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataSize = frames * n * 2;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, n, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * n * 2, true); // bytes per second
  view.setUint16(32, n * 2, true); // bytes per sample frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  let at = 44;
  for (let f = 0; f < frames; f++) {
    for (const samples of channels) {
      const s = Math.max(-1, Math.min(1, samples[f]!));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// A file name from the sentence: "I am a student." → "i-am-a-student.wav".
export function wavFileName(sentence: string): string {
  const slug = sentence
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${slug || 'tts'}.wav`;
}
