import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { MAX_STREAM_SECONDS } from "@shared/speech";
import { expect, it } from "vitest";

import { encodeWav } from "./capture";

it("keeps the actual worklet streaming beyond three minutes and stops at its configured session cap", () => {
  const code = readFileSync("public/speech-capture.worklet.js", "utf8");
  const output: unknown = runInNewContext(`
    let Processor;
    let frames = 0, limits = 0;
    class AudioWorkletProcessor {
      constructor() { this.port = { postMessage(data) { if (data === 'limit') limits++; else if (data instanceof Float32Array) frames++; } }; }
    }
    const sampleRate = 16000;
    function registerProcessor(name, value) { Processor = value; }
    ${code}
    const processor = new Processor({processorOptions:{maxSeconds:${MAX_STREAM_SECONDS}}});
    const input = [[new Float32Array(128)]];
    for(let i=0;i<22500;i++) processor.process(input);
    const afterThreeMinutes = {stopped:processor.stopped,frames,limits};
    for(let i=22500;i<75000;i++) processor.process(input);
    ({afterThreeMinutes, stoppedAtLimit:processor.stopped, limits});
  `);
  expect(output).toEqual({
    afterThreeMinutes: { stopped: false, frames: 5625, limits: 0 },
    stoppedAtLimit: true,
    limits: 1,
  });
});
it("never silently truncates a long recording into a short REST retry", () => {
  expect(() => encodeWav(new Float32Array(16000 * 30), 16000)).toThrow(
    "Long recordings",
  );
});
