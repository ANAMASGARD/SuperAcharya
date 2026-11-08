import { appPath } from "@agent-native/core/client/api-path";
import { speechResultSchema } from "@shared/speech";
import { z } from "zod";

export async function transcribeClip(
  boardId: string,
  audio: Blob,
  signal: AbortSignal,
) {
  const response = await fetch(
    appPath(`/api/whiteboard-speech/${encodeURIComponent(boardId)}`),
    {
      method: "POST",
      body: audio,
      headers: { "Content-Type": "audio/wav" },
      signal,
    },
  );
  if (!response.ok) {
    const error = z
      .object({
        message: z.string().max(300).optional(),
        statusMessage: z.string().max(300).optional(),
      })
      .safeParse(await response.json().catch(() => null));
    throw new Error(
      error.success
        ? (error.data.message ??
            error.data.statusMessage ??
            "Transcription failed. Please retry.")
        : "Transcription failed. Please retry.",
    );
  }
  return speechResultSchema.parse(await response.json());
}
