import type { MigrationEntry } from "@agent-native/core/db";
export const boardMigrations: MigrationEntry[] = [
  {
    version: 1,
    name: "private-excalidraw-boards-v1",
    sql: `CREATE TABLE IF NOT EXISTS whiteboard_profiles (
    id TEXT PRIMARY KEY, owner_email TEXT NOT NULL UNIQUE, latest_board_id TEXT
  );
  CREATE TABLE IF NOT EXISTS whiteboards (
    id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, title TEXT NOT NULL,
    scene JSONB NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1,
    revision TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS whiteboards_owner_updated ON whiteboards(owner_email, updated_at);
  CREATE TABLE IF NOT EXISTS whiteboard_assets (
    id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES whiteboards(id), owner_email TEXT NOT NULL,
    file_id TEXT NOT NULL, attachment_ref TEXT NOT NULL, mime_type TEXT NOT NULL,
    size INTEGER NOT NULL, created BIGINT NOT NULL, digest TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS whiteboard_assets_board_file ON whiteboard_assets(board_id, file_id);
  CREATE TABLE IF NOT EXISTS whiteboard_libraries (
    id TEXT PRIMARY KEY, owner_email TEXT NOT NULL UNIQUE, items JSONB NOT NULL, revision TEXT NOT NULL
  );`,
  },
  {
    version: 2,
    name: "whiteboard-library-timestamps-v1",
    sql: `ALTER TABLE whiteboard_libraries ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text;
    ALTER TABLE whiteboard_libraries ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text;`,
  },
];
