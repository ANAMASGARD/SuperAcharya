import { defineAction } from "@agent-native/core/action";

import { finishTeacherTurn } from "../server/lib/teacher/store";
import { boardOwner } from "../server/lib/whiteboards";
import { teacherTurnSchema, cancelTeacherSchema } from "../shared/teacher";

export default defineAction({
  description:
    "Stop only the named owned teacher generation. Repeated or late cancellation never affects a newer turn.",
  schema: cancelTeacherSchema,
  outputSchema: teacherTurnSchema,
  retrySafe: true,
  run: async (args, ctx) => {
    const owner = boardOwner(ctx);
    return finishTeacherTurn(
      owner,
      args.boardId,
      args.turnId,
      args.generation,
      "cancel",
    );
  },
});
