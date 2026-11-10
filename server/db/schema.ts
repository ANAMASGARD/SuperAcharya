import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  integer,
  bigint,
} from "drizzle-orm/pg-core";

import type { TeacherContext } from "../../shared/teacher";
import type {
  CapturedQuestion,
  TeachingStep,
} from "../../shared/teacher-board";
import type { BoardScene, LibraryItems } from "../../shared/whiteboard";
export const boardProfiles = pgTable("whiteboard_profiles", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull().unique(),
  latestBoardId: text("latest_board_id"),
});
export const boards = pgTable(
  "whiteboards",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    title: text("title").notNull(),
    scene: jsonb("scene").$type<BoardScene>().notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    revision: text("revision").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("whiteboards_owner_updated").on(table.ownerEmail, table.updatedAt),
  ],
);
export const boardAssets = pgTable(
  "whiteboard_assets",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    ownerEmail: text("owner_email").notNull(),
    fileId: text("file_id").notNull(),
    attachmentRef: text("attachment_ref").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    created: bigint("created", { mode: "number" }).notNull(),
    digest: text("digest").notNull(),
  },
  (table) => [
    uniqueIndex("whiteboard_assets_board_file").on(table.boardId, table.fileId),
  ],
);
export const boardLibraries = pgTable("whiteboard_libraries", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull().unique(),
  items: jsonb("items").$type<LibraryItems>().notNull(),
  revision: text("revision").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP::text`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP::text`),
});

export const teacherLessons = pgTable("teacher_lessons", {
  boardId: text("board_id")
    .primaryKey()
    .references(() => boards.id),
  ownerEmail: text("owner_email").notNull(),
  threadId: text("thread_id").notNull().unique(),
  context: jsonb("context").$type<TeacherContext>().notNull(),
  revision: integer("revision").notNull().default(0),
  activeTurnId: text("active_turn_id"),
});
export const teacherTurns = pgTable(
  "teacher_turns",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => teacherLessons.boardId),
    ownerEmail: text("owner_email").notNull(),
    generation: text("generation").notNull(),
    tabId: text("tab_id").notNull(),
    input: text("input").notNull(),
    payloadHash: text("payload_hash").notNull(),
    extractContext: integer("extract_context").notNull(),
    clockedRequestId: text("clocked_request_id").notNull(),
    boardCapture:
      jsonb("board_capture").$type<Omit<CapturedQuestion, "image" | "text">>(),
    response: text("response").notNull().default(""),
    status: text("status").notNull(),
    error: text("error"),
    processId: text("process_id").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("teacher_turns_board_created").on(table.boardId, table.createdAt),
  ],
);

export const teacherOperations = pgTable(
  "teacher_operations",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id),
    turnId: text("turn_id")
      .notNull()
      .references(() => teacherTurns.id),
    generation: text("generation").notNull(),
    tabId: text("tab_id").notNull(),
    sequence: integer("sequence").notNull(),
    step: jsonb("step").$type<TeachingStep>().notNull(),
    elementIds: jsonb("element_ids").$type<string[]>().notNull(),
    status: text("status").notNull().default("queued"),
  },
  (table) => [
    index("teacher_operations_turn_sequence").on(table.turnId, table.sequence),
  ],
);

// Ephemeral Better Auth request counters; no email addresses or OTPs.
export const authRateLimits = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
