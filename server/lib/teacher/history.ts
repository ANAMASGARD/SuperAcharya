import type { ModelMessage } from "ai";
import type { TeacherTurn } from "../../../shared/teacher";

/** Durable recent conversation, including interrupted work without claiming it finished. */
export function teacherHistory(turns: TeacherTurn[], currentId: string): ModelMessage[] {
  return turns.filter(turn => turn.id !== currentId && ["completed", "interrupted", "cancelled"].includes(turn.status))
    .flatMap((turn): ModelMessage[] => [
      { role: "user", content: turn.input },
      { role: "assistant", content: turn.status === "completed" ? turn.response : `[This response was interrupted; do not assume it was heard or completed.]\n${turn.response || "No response was completed."}` },
    ]);
}
