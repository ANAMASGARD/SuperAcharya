import { defineAction } from "@agent-native/core/action";

import { admitTeacherTurn } from "../server/lib/teacher/store";
import { boardOwner } from "../server/lib/whiteboards";
import { teacherTurnSchema, startTeacherSchema } from "../shared/teacher";

export default defineAction({
  description:
    "Admit one completed student question for the active classroom. Reuse requestId on retries. The controlling whiteboard attaches the teacher stream; this action never runs an LLM.",
  schema: startTeacherSchema,
  outputSchema: teacherTurnSchema,
  retrySafe: true,
  run: async (args, ctx) => {
    const owner = boardOwner(ctx);
    return admitTeacherTurn(owner, args);
  },
});
