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
  {
    version: 3,
    name: "teacher-request-owned-turns-v1",
    sql: `CREATE TABLE IF NOT EXISTS teacher_lessons (
      board_id TEXT PRIMARY KEY REFERENCES whiteboards(id), owner_email TEXT NOT NULL,
      thread_id TEXT NOT NULL UNIQUE, context JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      active_turn_id TEXT
    );
    CREATE TABLE IF NOT EXISTS teacher_turns (
      id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES teacher_lessons(board_id), owner_email TEXT NOT NULL,
      generation TEXT NOT NULL, tab_id TEXT NOT NULL, input TEXT NOT NULL, payload_hash TEXT NOT NULL,
      extract_context INTEGER NOT NULL, clocked_request_id TEXT NOT NULL, response TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, error TEXT, process_id TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS teacher_turns_board_created ON teacher_turns(board_id, created_at);`,
  },
  {
    version: 4,
    name: "teacher-semantic-board-steps-v1",
    sql: `ALTER TABLE teacher_turns ADD COLUMN IF NOT EXISTS board_capture JSONB;
    CREATE TABLE IF NOT EXISTS teacher_operations (
      id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, board_id TEXT NOT NULL REFERENCES whiteboards(id),
      turn_id TEXT NOT NULL REFERENCES teacher_turns(id), generation TEXT NOT NULL, tab_id TEXT NOT NULL,
      sequence INTEGER NOT NULL, step JSONB NOT NULL, element_ids JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'queued'
    );
    CREATE INDEX IF NOT EXISTS teacher_operations_turn_sequence ON teacher_operations(turn_id, sequence);`,
  },
  {
    version: 5,
    name: "email-auth-rate-limits-v1",
    sql: `CREATE TABLE IF NOT EXISTS auth_rate_limits (
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL,
      last_request BIGINT NOT NULL
    );`,
  },
];
