import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listTeachingSteps } from "../server/lib/teacher/board-operations";
import { boardOwner } from "../server/lib/whiteboards";
import { teachingOperationSchema } from "../shared/teacher-board";
import { boardIdSchema } from "../shared/whiteboard";
export default defineAction({
  description:
    "Read ordered semantic steps and their applied status for an owned drawing and teacher turn.",
  schema: z.object({ boardId: boardIdSchema, turnId: boardIdSchema }),
  outputSchema: z.array(teachingOperationSchema),
  http: { method: "GET" },
  readOnly: true,
  run: (args, ctx) =>
    listTeachingSteps(boardOwner(ctx), args.boardId, args.turnId),
});
