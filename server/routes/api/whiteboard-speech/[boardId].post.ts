import { isActionContractError } from "@agent-native/core/action";
// Authenticated binary-audio protocol exception; no raw audio is persisted.
import { getSession, runWithRequestContext } from "@agent-native/core/server";
import {
  assertBodySize,
  createError,
  defineEventHandler,
  getRouterParam,
} from "h3";

import { MAX_SPEECH_BYTES, validateSpeechWav } from "../../../../shared/speech";
import { boardIdSchema } from "../../../../shared/whiteboard";
import { gnaniKey, transcribeWithGnani } from "../../../lib/gnani-speech";
import { activeSpeechUsers as active } from "../../../lib/speech-slots";
import { ownedBoard } from "../../../lib/whiteboards";

// Bound simultaneous provider work per authenticated user in this Node process.

export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session?.email)
    throw createError({ statusCode: 401, message: "Sign in to use speech." });
  if (event.req.headers.get("origin") !== new URL(event.req.url).origin)
    throw createError({
      statusCode: 403,
      message: "Invalid speech request origin.",
    });
  const owner = session.email.toLowerCase();
  if (active.has(owner))
    throw createError({
      statusCode: 429,
      message: "A transcription is already running. Please wait.",
    });
  const id = boardIdSchema.safeParse(getRouterParam(event, "boardId"));
  if (!id.success)
    throw createError({ statusCode: 400, message: "Invalid drawing ID." });
  if (event.req.headers.get("content-type") !== "audio/wav")
    throw createError({ statusCode: 415, message: "Expected PCM WAV audio." });
  active.add(owner);
  try {
    return await runWithRequestContext(
      {
        userEmail: owner,
        orgScope: "personal",
        ...(session.authUserId ? { authUserId: session.authUserId } : {}),
      },
      async () => {
        await ownedBoard(owner, id.data);
        const key = await gnaniKey();
        await assertBodySize(event, MAX_SPEECH_BYTES);
        const bytes = new Uint8Array(await event.req.arrayBuffer());
        try {
          validateSpeechWav(bytes);
        } catch {
          throw createError({
            statusCode: 400,
            message: "Record between 0.1 and 29 seconds of audio.",
          });
        }
        return transcribeWithGnani(bytes, key, event.req.signal);
      },
    );
  } catch (error) {
    if (isActionContractError(error))
      throw createError({
        statusCode: error.statusCode,
        message: error.message,
      });
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw createError({
        statusCode: 504,
        message: "Transcription stopped or timed out. Please retry.",
      });
    throw error;
  } finally {
    active.delete(owner);
  }
});
