import { z } from "zod";
import { teacherVoiceSchema } from "./teacher-voices";

import {
  boardCaptureMetadataSchema,
  capturedQuestionSchema,
} from "./teacher-board";
import { boardIdSchema } from "./whiteboard";

export const teacherContextSchema = z
  .object({
    voice: teacherVoiceSchema.optional(),
    favoriteVoices: z.array(teacherVoiceSchema).max(222).optional(),
    learnerLevel: z.string().trim().min(1).max(80).optional(),
    subject: z.string().trim().min(1).max(80).optional(),
    topic: z.string().trim().min(1).max(160).optional(),
    responseLanguage: z.enum(["en", "hi", "hinglish"]).optional(),
    teachingMode: z.enum(["practice", "student-question"]).optional(),
  })
  .strict();
export type TeacherContext = z.infer<typeof teacherContextSchema>;
export const teacherStatusSchema = z.enum([
  "admitted",
  "running",
  "completed",
  "cancelled",
  "failed",
  "interrupted",
]);
export const teacherTurnSchema = z.object({
  id: boardIdSchema,
  boardId: boardIdSchema,
  generation: boardIdSchema,
  tabId: z.string(),
  input: z.string(),
  response: z.string(),
  status: teacherStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type TeacherTurn = z.infer<typeof teacherTurnSchema>;
export const teacherSessionSchema = z.object({
  boardId: boardIdSchema,
  threadId: z.string(),
  context: teacherContextSchema,
  revision: z.number().int().nonnegative(),
  turns: z.array(teacherTurnSchema),
});
export type TeacherSession = z.infer<typeof teacherSessionSchema>;
export const startTeacherSchema = z
  .object({
    boardId: boardIdSchema.describe("Owned drawing for this conversation."),
    requestId: boardIdSchema.describe(
      "Stable Nano ID for this logical submission; preserve on retries.",
    ),
    tabId: z.string().min(1).max(100).describe("Controlling browser tab ID."),
    text: z
      .string()
      .trim()
      .min(1)
      .max(12000)
      .describe("Completed student input, never a partial speech update."),
    extractContext: z
      .boolean()
      .default(false)
      .describe(
        "True for explicit learning-preference changes; false for ordinary questions.",
      ),
    boardCapture: boardCaptureMetadataSchema
      .optional()
      .describe(
        "Fingerprint and selection of the current browser capture, when board teaching is enabled. Never image bytes.",
      ),
  })
  .strict();
export const cancelTeacherSchema = z
  .object({
    boardId: boardIdSchema,
    turnId: boardIdSchema,
    generation: boardIdSchema,
  })
  .strict();
export const updateTeacherContextSchema = z
  .object({
    boardId: boardIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    patch: teacherContextSchema,
    turnId: boardIdSchema.optional(),
    generation: boardIdSchema.optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.turnId) === Boolean(v.generation),
    "Turn and generation must be supplied together.",
  );
export const teacherAudioSchema = z.object({
  type: z.literal("teacher-audio"),
  turnId: boardIdSchema,
  generation: boardIdSchema,
  sequence: z.number().int().nonnegative(),
  audio: z.string().max(3_000_000),
  mimeType: z.literal("audio/mpeg"),
});
export const teacherStreamRequestSchema = cancelTeacherSchema.extend({
  tabId: z.string().min(1).max(100),
  capture: capturedQuestionSchema.optional(),
});
export const teacherStreamEventSchema = z.discriminatedUnion("type", [
  teacherAudioSchema,
  z.object({
    type: z.literal("teacher-visual-ready"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    operationId: z.string().min(1),
  }),
  z.object({
    type: z.literal("done"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    reason: z.literal("complete"),
  }),
  z.object({
    type: z.literal("teacher-board-op"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    operationId: z.string(),
    audio: z.string().max(3_000_000).nullable(),
  }),
  z.object({
    type: z.literal("message-start"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    message: z.object({
      id: z.string(),
      role: z.literal("assistant"),
      content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
      status: z.literal("streaming"),
    }),
  }),
  z.object({
    type: z.literal("message-delta"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    messageId: z.string(),
    delta: z.object({ type: z.literal("text"), text: z.string() }),
  }),
  z.object({
    type: z.literal("message-done"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    message: z.object({
      id: z.string(),
      role: z.literal("assistant"),
      content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
      status: z.literal("complete"),
    }),
  }),
  z.object({
    type: z.literal("teacher-notice"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    message: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    turnId: boardIdSchema,
    generation: boardIdSchema,
    error: z.string(),
  }),
]);
