import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getTeacherSession } from "../server/lib/teacher/store";
import { boardOwner } from "../server/lib/whiteboards";
import { teacherSessionSchema } from "../shared/teacher";
import { boardIdSchema } from "../shared/whiteboard";

export default defineAction({
  description:
    "Read the saved teacher conversation and learning context without creating or executing a turn.",
  schema: z.object({ boardId: boardIdSchema }),
  outputSchema: teacherSessionSchema.nullable(),
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) => {
    const owner = boardOwner(ctx);
    return getTeacherSession(owner, args.boardId);
  },
});
