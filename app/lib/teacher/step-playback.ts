import type { TeachingOperation } from "@shared/teacher-board";
import type { BrowserTeachingTools } from "./board";
import type { TeacherAudio } from "./audio";

/** Speak once pixels exist; acknowledge only after audio and durable scene verification. */
export async function renderAndNarrateStep(
  tools: BrowserTeachingTools,
  audio: TeacherAudio,
  operation: TeachingOperation,
  encodedAudio: string | null,
  isActive: () => boolean,
) {
  let playback: Promise<boolean> | undefined;
  const startPlayback = () => {
    if (!playback && encodedAudio && isActive())
      playback = audio.playStep(operation.generation, encodedAudio);
  };
  await tools.apply(operation, isActive, startPlayback);
  if (!isActive()) throw new Error("Teacher playback stopped.");
  startPlayback();
  if (playback && !(await playback))
    throw new Error("Teacher playback stopped. Written work is preserved.");
  if (!isActive()) throw new Error("Teacher playback stopped.");
  return tools.apply(operation, isActive);
}
