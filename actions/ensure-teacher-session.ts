import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { ensureTeacherSession } from "../server/lib/teacher/store";
import { boardOwner } from "../server/lib/whiteboards";
import { teacherSessionSchema } from "../shared/teacher";
import { boardIdSchema } from "../shared/whiteboard";

export default defineAction({
  description:
    "Ensure an owned teacher conversation for a drawing; safe to retry.",
  schema: z.object({ boardId: boardIdSchema }),
  outputSchema: teacherSessionSchema,
  retrySafe: true,
  run: async (args, ctx) => {
    const owner = boardOwner(ctx);
    return ensureTeacherSession(owner, args.boardId);
  },
});
