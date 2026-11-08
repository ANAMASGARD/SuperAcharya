import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { speechCredential } from "../server/lib/speech-config";
import { boardOwner, ownedBoard } from "../server/lib/whiteboards";
import { SPEECH_MODEL } from "../shared/speech";
import { boardIdSchema } from "../shared/whiteboard";
export default defineAction({
  description:
    "Check Gnani Prisma speech setup for an owned drawing. No microphone access or transcription is performed.",
  schema: z.object({ boardId: boardIdSchema }),
  outputSchema: z.object({
    status: z.enum(["ready", "setup-required", "unavailable"]),
    model: z.literal(SPEECH_MODEL),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ boardId }, ctx) => {
    await ownedBoard(boardOwner(ctx), boardId);
    const result = await speechCredential();
    return {
      status: result.lookupFailed
        ? "unavailable"
        : result.value
          ? "ready"
          : "setup-required",
      model: SPEECH_MODEL,
    } as const;
  },
});
