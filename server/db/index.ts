import { createGetDb } from "@agent-native/core/db";
import { registerIdentityColumns } from "@agent-native/core/org";

import * as schema from "./schema";
registerIdentityColumns(
  [
    "whiteboard_profiles",
    "whiteboards",
    "whiteboard_assets",
    "whiteboard_libraries",
    "teacher_lessons",
    "teacher_turns",
    "teacher_operations",
  ].map((table) => ({
    table,
    column: "owner_email",
    emailChange: "rekey" as const,
    offboard: "retain" as const,
    reason:
      "Personal private drawings remain associated with their account; organization offboarding does not transfer them.",
  })),
);
export const getDb = createGetDb(schema);
