// Increment this when audio processing changes so old cached clips are not reused.
export const AUDIO_VERSION = 'levelled-pcm-v1';
export const NARRATORS = ['Samantha', 'Daniel', 'Karen'];

export function normalizeWav(bytes: Buffer): number {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV');
  let byteRate = 0, dataStart = 0, dataSize = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (at + 8 + size > bytes.length) throw new Error('Truncated WAV');
    if (tag === 'fmt ') {
      if (size < 16 || bytes.readUInt16LE(at + 8) !== 1 || bytes.readUInt16LE(at + 22) !== 16) throw new Error('Expected 16-bit PCM');
      byteRate = bytes.readUInt32LE(at + 16);
    }
    if (tag === 'data') { dataStart = at + 8; dataSize = size; }
    at += 8 + size + (size % 2);
  }
  if (!byteRate || !dataStart || !dataSize || dataSize % 2) throw new Error('Empty or invalid audio');
  let peak = 0;
  for (let at = dataStart; at < dataStart + dataSize; at += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(at)));
  if (!peak) throw new Error('Speech service returned silence');
  let squares = 0, count = 0;
  // Ignore pauses so short headings and long sentences have comparable speech levels.
  for (let at = dataStart; at < dataStart + dataSize; at += 2) {
    const sample = bytes.readInt16LE(at);
    if (Math.abs(sample) > peak * .02) { squares += sample * sample; count++; }
  }
  // shortcut: RMS approximates perceived loudness; use LUFS if we add other TTS providers.
  const gain = Math.min((32768 * 10 ** (-16 / 20)) / Math.sqrt(squares / count), (32767 * .95) / peak, 4);
  for (let at = dataStart; at < dataStart + dataSize; at += 2) bytes.writeInt16LE(Math.round(bytes.readInt16LE(at) * gain), at);
  return dataSize / byteRate;
}
