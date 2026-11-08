import { runMigrations } from "@agent-native/core/db";

import "../db/index";
import { boardMigrations } from "../db/migrations";
export default runMigrations(boardMigrations, {
  table: "super_acharya_migrations",
});
