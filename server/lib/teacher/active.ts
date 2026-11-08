import { randomUUID } from "node:crypto";

/** The request-owned teacher supports one Node executor, not a distributed worker. */
export const teacherProcessId = randomUUID();
const controllers = new Map<
  string,
  { generation: string; controller: AbortController }
>();
export function registerTeacherRun(
  id: string,
  generation: string,
  controller: AbortController,
) {
  if (controllers.has(id)) throw new Error("Teacher turn is already attached.");
  controllers.set(id, { generation, controller });
  return () => {
    if (controllers.get(id)?.controller === controller) controllers.delete(id);
  };
}
export function abortTeacherRun(id: string, generation: string) {
  const run = controllers.get(id);
  if (run?.generation === generation) run.controller.abort();
}
