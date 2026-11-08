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
