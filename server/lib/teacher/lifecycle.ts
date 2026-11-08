import { defineMachine } from "@agent-native/core/state-machine";

export const teacherLifecycle = defineMachine({
  id: "teacher-turn",
  states: [
    "admitted",
    "running",
    "completed",
    "cancelled",
    "failed",
    "interrupted",
  ],
  initial: "admitted",
  terminal: ["completed", "cancelled", "failed", "interrupted"],
  transitions: {
    attach: { from: ["admitted"], to: "running" },
    complete: { from: ["running"], to: "completed" },
    cancel: { from: ["admitted", "running"], to: "cancelled" },
    fail: { from: ["admitted", "running"], to: "failed" },
    interrupt: { from: ["admitted", "running"], to: "interrupted" },
  },
});
