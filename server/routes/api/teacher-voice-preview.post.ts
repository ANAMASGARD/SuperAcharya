// Authenticated binary-audio exception. Fixed samples only; never persist audio.
import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { assertBodySize, createError, defineEventHandler } from "h3";
import { z } from "zod";
import { boardIdSchema } from "../../../shared/whiteboard";
import { teacherVoiceSchema } from "../../../shared/teacher-voices";
import { ownedBoard } from "../../lib/whiteboards";
import { teacherCredential } from "../../lib/teacher/config";
import { SarvamNarrator } from "../../lib/teacher/providers/sarvam";

const active = new Set<string>();
const inputSchema = z.object({ boardId: boardIdSchema, voice: teacherVoiceSchema }).strict();
export default defineEventHandler(async event => {
  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401, message: "Sign in to preview voices." });
  if (event.req.headers.get("origin") !== new URL(event.req.url).origin)
    throw createError({ statusCode: 403, message: "Invalid preview origin." });
  await assertBodySize(event, 2048);
  const parsed = inputSchema.safeParse(await event.req.json());
  if (!parsed.success) throw createError({ statusCode: 400, message: "Invalid voice selection." });
  const owner = session.email.toLowerCase();
  if (active.has(owner)) throw createError({ statusCode: 429, message: "A voice preview is already loading." });
  active.add(owner);
  const signal = AbortSignal.any([event.req.signal, AbortSignal.timeout(25_000)]);
  try {
    return await runWithRequestContext({ userEmail: owner, orgScope: "personal", ...(session.authUserId ? { authUserId: session.authUserId } : {}) }, async () => {
      await ownedBoard(owner, parsed.data.boardId);
      const key = await teacherCredential("SARVAM_API_KEY");
      if (!key) throw createError({ statusCode: 503, message: "Configure Sarvam to preview voices." });
      signal.throwIfAborted();
      const hindi = /_(hi|enhi)_/.test(parsed.data.voice);
      const narrator = new SarvamNarrator(key, parsed.data.voice, hindi ? "hi-IN" : "en-IN", signal);
      try {
        const audio = await narrator.speak(hindi ? "नमस्ते! चलिए, आज कुछ नया सीखते हैं। मैं आपको हर कदम समझाऊँगा।" : "Hello! Let's learn something new today. We will explore the answer together, one step at a time.");
        return new Response(new Uint8Array(Buffer.from(audio, "base64")), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
      } finally { narrator.close(); }
    });
  } finally { active.delete(owner); }
});
