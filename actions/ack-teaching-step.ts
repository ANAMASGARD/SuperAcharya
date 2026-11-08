import { defineAction } from "@agent-native/core/action";

import { acknowledgeTeachingStep } from "../server/lib/teacher/board-operations";
import { boardOwner } from "../server/lib/whiteboards";
import {
  acknowledgeTeachingStepSchema,
  teachingOperationSchema,
} from "../shared/teacher-board";
export default defineAction({
  description:
    "Acknowledge a teaching step only after the controlling browser saves and verifies its actual elements.",
  schema: acknowledgeTeachingStepSchema,
  outputSchema: teachingOperationSchema,
  retrySafe: true,
  run: (args, ctx) => acknowledgeTeachingStep(boardOwner(ctx), args),
});
