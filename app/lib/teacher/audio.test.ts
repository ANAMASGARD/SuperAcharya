// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

import { TeacherAudio } from "./audio";
afterEach(() => vi.unstubAllGlobals());
it("plays at full volume, waits for real completion, and discards cancelled generations", async () => {
  const players: HTMLAudioElement[] = [];
  vi.stubGlobal("Audio", function () {
    const element = document.createElement("audio");
    element.play = vi.fn().mockResolvedValue(undefined);
    element.pause = vi.fn();
    players.push(element);
    return element;
  });
  const audio = new TeacherAudio(vi.fn());
  audio.begin("one");
  const playing = audio.playStep("one", btoa("synthetic MP3 fixture"));
  expect(players[0]?.volume).toBe(1);
  players[0]?.dispatchEvent(new Event("ended"));
  expect(await playing).toBe(true);
  const interrupted = audio.playStep("one", btoa("next fixture"));
  audio.stop();
  expect(await interrupted).toBe(false);
  expect(await audio.playStep("one", btoa("stale fixture"))).toBe(false);
  audio.begin("two");
  audio.enqueue("one", 0, btoa("stale"));
  expect(players).toHaveLength(2);
});
