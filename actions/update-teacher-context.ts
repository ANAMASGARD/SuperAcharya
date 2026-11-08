import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { updateTeacherContext } from "../server/lib/teacher/store";
import { boardOwner } from "../server/lib/whiteboards";
import {
  updateTeacherContextSchema,
  teacherContextSchema,
} from "../shared/teacher";

export default defineAction({
  description:
    "Update explicitly supplied learning preferences with revision protection. Optional turn and generation fence teacher-proposed changes.",
  schema: updateTeacherContextSchema,
  outputSchema: z.object({
    context: teacherContextSchema,
    revision: z.number().int(),
  }),
  retrySafe: false,
  run: async (args, ctx) => {
    const owner = boardOwner(ctx);
    return updateTeacherContext(owner, args);
  },
});
