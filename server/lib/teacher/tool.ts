import {
  executeAgentToolCall,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";
import type { z } from "zod";

import enqueueStep from "../../../actions/enqueue-teaching-step";
import updateContext from "../../../actions/update-teacher-context";
import type { updateTeacherContextSchema } from "../../../shared/teacher";
import type { enqueueTeachingStepSchema } from "../../../shared/teacher-board";

export const teacherTools = loadActionsFromStaticRegistry({
  "update-teacher-context": updateContext,
  "enqueue-teaching-step": enqueueStep,
});
export async function applyLearningContext(
  owner: string,
  input: z.infer<typeof updateTeacherContextSchema>,
  signal: AbortSignal,
) {
  return executeAgentToolCall({
    actions: teacherTools,
    name: "update-teacher-context",
    input,
    ownerEmail: owner,
    caller: "tool",
    signal,
    callId: `context-${input.turnId}`,
    threadId: `teacher:${input.boardId}`,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    // Extraction is explicitly selected by the student; framework authorization still applies.
    requireWriteApproval: false,
  });
}

export async function publishTeachingStep(
  owner: string,
  input: z.infer<typeof enqueueTeachingStepSchema>,
  signal: AbortSignal,
) {
  return executeAgentToolCall({
    actions: teacherTools,
    name: "enqueue-teaching-step",
    input,
    ownerEmail: owner,
    caller: "tool",
    signal,
    callId: `step-${input.turnId}-${input.sequence}`,
    threadId: `teacher:${input.boardId}`,
    turnId: input.turnId,
    requireWriteApproval: false,
  });
}
