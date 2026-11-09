import { expect, it } from "vitest";
import { welcomeRequestId } from "./teacher-welcome";
it("deduplicates effects within a visit and permits a fresh greeting on the next visit", async () => {
  const first = await welcomeRequestId("board", "visit-one");
  expect(first).toHaveLength(21);
  expect(await welcomeRequestId("board", "visit-one")).toBe(first);
  expect(await welcomeRequestId("board", "visit-two")).not.toBe(first);
});
