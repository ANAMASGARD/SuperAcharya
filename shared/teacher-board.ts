import { z } from "zod";

import { boardIdSchema } from "./whiteboard";

export const teachingStepSchema = z
  .object({
    heading: z.string().trim().min(1).max(100),
    lines: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
    narration: z.string().trim().min(1).max(600),
  })
  .strict();
export type TeachingStep = z.infer<typeof teachingStepSchema>;
export const boardCaptureMetadataSchema = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.string().min(1).max(128),
    selectedElementIds: z.array(z.string().min(1).max(128)).max(200),
  })
  .strict();
export const capturedQuestionSchema = boardCaptureMetadataSchema
  .extend({
    image: z
      .string()
      .startsWith("data:image/png;base64,")
      .max(1_500_000)
      .nullable(),
    text: z.string().max(12000),
  })
  .strict();
export type CapturedQuestion = z.infer<typeof capturedQuestionSchema>;
export const enqueueTeachingStepSchema = z
  .object({
    boardId: boardIdSchema,
    turnId: boardIdSchema,
    generation: boardIdSchema,
    sequence: z.number().int().min(0).max(11),
    step: teachingStepSchema,
  })
  .strict();
export const teachingOperationSchema = enqueueTeachingStepSchema
  .extend({
    id: z.string(),
    tabId: z.string(),
    status: z.enum(["queued", "applied", "cancelled", "failed"]),
    elementIds: z.array(z.string()),
  })
  .strip();
export type TeachingOperation = z.infer<typeof teachingOperationSchema>;
export const acknowledgeTeachingStepSchema = z
  .object({
    boardId: boardIdSchema,
    turnId: boardIdSchema,
    generation: boardIdSchema,
    operationId: z.string().min(1).max(100),
    tabId: z.string().min(1).max(100),
    result: z.enum(["applied", "failed"]),
    savedRevision: z.string().min(1).max(128).optional(),
  })
  .strict();
