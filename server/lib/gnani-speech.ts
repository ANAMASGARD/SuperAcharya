import { createError } from "h3";
import { z } from "zod";

import {
  SPEECH_MODEL,
  speechResultSchema,
  validateSpeechWav,
} from "../../shared/speech";
import { speechCredential } from "./speech-config";

export async function gnaniKey() {
  const secret = await speechCredential();
  if (secret.lookupFailed)
    throw createError({
      statusCode: 503,
      message: "Could not read speech credentials. Please retry.",
    });
  if (!secret.value)
    throw createError({
      statusCode: 503,
      message:
        "Set GNANI_API_KEY on the server or add your Gnani API key in Settings → Secrets.",
    });
  return secret.value;
}

const responseSchema = z.object({
  success: z.literal(true),
  transcript: z.string().max(20000),
  model: z.literal(SPEECH_MODEL).optional(),
  detected_language_code: z.string().max(32).optional(),
  truncated: z.boolean().optional(),
});

export async function transcribeWithGnani(
  bytes: Uint8Array,
  key: string,
  signal: AbortSignal,
) {
  validateSpeechWav(bytes);
  const form = new FormData();
  form.append(
    "audio_file",
    new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
    "speech.wav",
  );
  form.append("model", SPEECH_MODEL);
  form.append("language_code", "hi-IN,en-IN");
  form.append("format", "codemix");
  const response = await fetch("https://api.vachana.ai/stt/v3", {
    method: "POST",
    headers: { "X-API-Key-ID": key },
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    redirect: "error",
  });
  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "Gnani rejected the key or its STT permissions. Check Settings."
        : response.status === 402
          ? "Gnani speech credits are unavailable. Check your Gnani account."
          : response.status === 429
            ? "Gnani is busy. Wait a moment before retrying."
            : "Gnani could not transcribe this clip. Please retry.";
    throw createError({
      statusCode: response.status === 429 ? 429 : 502,
      message,
    });
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success)
    throw createError({
      statusCode: 502,
      message: "Gnani returned an invalid transcription response.",
    });
  return speechResultSchema.parse({
    transcript: parsed.data.transcript,
    model: SPEECH_MODEL,
    detectedLanguage: parsed.data.detected_language_code,
    truncated: parsed.data.truncated ?? false,
  });
}
