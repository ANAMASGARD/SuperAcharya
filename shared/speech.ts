import { z } from "zod";

export const SPEECH_MODEL = "prisma-v3.0";
export const SPEECH_SAMPLE_RATE = 16000;
// REST recovery limit, independent of the realtime session duration.
export const MAX_SPEECH_SECONDS = 29;
export const MAX_STREAM_SECONDS = 10 * 60;
export const MAX_UTTERANCE_SECONDS = 5;
export const MAX_SPEECH_BYTES =
  44 + SPEECH_SAMPLE_RATE * 2 * MAX_SPEECH_SECONDS;
export const speechResultSchema = z.object({
  transcript: z.string().max(20000),
  model: z.literal(SPEECH_MODEL),
  detectedLanguage: z.string().max(32).optional(),
  truncated: z.boolean(),
});
export type SpeechResult = z.infer<typeof speechResultSchema>;

/** Accept only the bounded, canonical mono PCM WAV produced by our capture. */
export function validateSpeechWav(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, size: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + size));
  if (
    bytes.length < 3244 ||
    bytes.length > MAX_SPEECH_BYTES ||
    bytes.length % 2 ||
    tag(0, 4) !== "RIFF" ||
    tag(8, 4) !== "WAVE" ||
    tag(12, 4) !== "fmt " ||
    tag(36, 4) !== "data" ||
    view.getUint32(4, true) !== bytes.length - 8 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== SPEECH_SAMPLE_RATE ||
    view.getUint32(28, true) !== SPEECH_SAMPLE_RATE * 2 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.length - 44
  )
    throw new Error(
      "Use a mono 16 kHz PCM WAV clip between 0.1 and 29 seconds.",
    );
}
