import { expect, it } from "vitest";
import type { TeacherTurn } from "../../../shared/teacher";
import { teacherHistory } from "./history";
it("retains older recent context and marks interruptions without including pending or current turns", () => {
  const turns: TeacherTurn[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i), boardId: "board", generation: String(i), tabId: "tab", input: i === 0 ? "Use degrees for theta" : "Explain again", response: "An angle measures rotation", status: "completed", error: null, createdAt: "fixture" }));
  const interrupted = turns[10];
  if (!interrupted) throw new Error("Missing fixture");
  interrupted.status = "interrupted";
  const history = teacherHistory(turns, "11");
  expect(history).toHaveLength(22);
  expect(history[0]?.content).toBe("Use degrees for theta");
  expect(history[21]?.content).toContain("interrupted");
  interrupted.status = "running";
  expect(teacherHistory(turns, "11")).toHaveLength(20);
});
