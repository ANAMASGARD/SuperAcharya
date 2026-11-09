import { expect, it, vi } from "vitest";
import { teachingOperationSchema } from "@shared/teacher-board";
import { renderAndNarrateStep } from "./step-playback";
import { TeacherAudio } from "./audio";
import type { BrowserTeachingTools } from "./board";

it("starts audio after render while save is pending, but waits for save and playback before returning", async () => {
  const operation = teachingOperationSchema.parse({ id: "123456789012345678901", boardId: "123456789012345678901", turnId: "123456789012345678901", generation: "123456789012345678901", tabId: "tab", sequence: 0, status: "queued", step: { heading: "Step", lines: ["x = 1"], narration: "One" }, elementIds: ["head", "line"] });
  let save: (revision: string) => void = () => {};
  let finishAudio: (played: boolean) => void = () => {};
  const audio = new TeacherAudio(vi.fn());
  const play = vi.spyOn(audio, "playStep").mockImplementation(() => new Promise(resolve => { finishAudio = resolve; }));
  const apply: BrowserTeachingTools["apply"] = vi.fn(async (_, __, rendered) => {
    if (rendered) { rendered(); return new Promise<string>(resolve => { save = resolve; }); }
    return "verified";
  });
  let done = false;
  const result = renderAndNarrateStep({ apply, capture: vi.fn() }, audio, operation, "fixture", () => true).then(revision => { done = true; return revision; });
  expect(play).toHaveBeenCalledOnce();
  expect(done).toBe(false);
  save("saved"); await Promise.resolve();
  expect(done).toBe(false);
  finishAudio(true);
  expect(await result).toBe("verified");
  expect(apply).toHaveBeenCalledTimes(2);
});
