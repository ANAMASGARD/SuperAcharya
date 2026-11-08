// Mono capture only; output stays silent. Batching avoids per-frame UI work.
class SpeechCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.maxSeconds = options.processorOptions.maxSeconds;
    this.samples = [];
    this.total = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data === "stop") {
        this.flush();
        this.stopped = true;
        this.port.postMessage("stopped");
      }
    };
  }
  flush() {
    if (!this.samples.length) return;
    const chunk = new Float32Array(this.samples);
    this.samples = [];
    this.port.postMessage(chunk, [chunk.buffer]);
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (input) {
      for (const sample of input) {
        if (this.total >= sampleRate * this.maxSeconds) break;
        this.samples.push(sample);
        this.total++;
      }
      if (this.samples.length >= 512) this.flush();
      if (this.total >= sampleRate * this.maxSeconds) {
        this.flush();
        this.stopped = true;
        this.port.postMessage("limit");
      }
    }
    return !this.stopped;
  }
}
registerProcessor("speech-capture", SpeechCapture);
