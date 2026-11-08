import { defineAction } from "@agent-native/core/action";

import { enqueueTeachingStep } from "../server/lib/teacher/board-operations";
import { boardOwner } from "../server/lib/whiteboards";
import {
  enqueueTeachingStepSchema,
  teachingOperationSchema,
} from "../shared/teacher-board";
export default defineAction({
  description:
    "Queue one semantic teaching step for the active drawing and generation; this does not mean it has been drawn.",
  schema: enqueueTeachingStepSchema,
  outputSchema: teachingOperationSchema,
  retrySafe: true,
  run: (args, ctx) => enqueueTeachingStep(boardOwner(ctx), args),
});
