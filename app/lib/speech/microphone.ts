import { appPath } from "@agent-native/core/client/api-path";
import { SPEECH_SAMPLE_RATE } from "@shared/speech";

/** Keep the device warm. Only an explicit capture connects it to a processor. */
export class ReadyMicrophone {
  private stream: MediaStream | null = null;
  private pending: Promise<MediaStream> | null = null;
  private disposed = false;
  private leased = false;
  private context: AudioContext | null = null;
  private audioReady: Promise<AudioContext> | null = null;

  constructor(private readonly ready: (value: boolean) => void = () => {}) {}

  async prepare(): Promise<MediaStream> {
    if (this.disposed)
      throw new DOMException("Microphone closed", "AbortError");
    if (
      this.stream?.getAudioTracks().some((track) => track.readyState === "live")
    )
      return this.stream;
    if (this.pending) return this.pending;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Microphone capture requires HTTPS or localhost.");
    this.pending = navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        if (this.disposed) {
          stream.getTracks().forEach((track) => track.stop());
          throw new DOMException("Microphone closed", "AbortError");
        }
        this.stream = stream;
        for (const track of stream.getAudioTracks()) {
          // Keep the device awake; idle audio is not connected, stored or sent.
          track.enabled = true;
          track.addEventListener(
            "ended",
            () => {
              if (this.stream === stream) this.ready(false);
            },
            { once: true },
          );
        }
        this.ready(true);
        return stream;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private prepareAudio(): Promise<AudioContext> {
    if (this.disposed)
      return Promise.reject(
        new DOMException("Microphone closed", "AbortError"),
      );
    if (this.audioReady && this.context && this.context.state !== "closed")
      return this.audioReady;
    if (!globalThis.AudioContext)
      return Promise.reject(
        new Error("This browser does not support microphone processing."),
      );
    const context = new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE });
    this.context = context;
    this.audioReady = (async () => {
      try {
        if (context.sampleRate !== SPEECH_SAMPLE_RATE)
          throw new Error("This browser cannot capture 16 kHz speech.");
        await context.audioWorklet.addModule(
          appPath("/speech-capture.worklet.js"),
        );
        if (this.disposed)
          throw new DOMException("Microphone closed", "AbortError");
        return context;
      } catch (error) {
        if (context.state !== "closed") void context.close().catch(() => {});
        if (this.context === context) {
          this.context = null;
          this.audioReady = null;
        }
        throw error;
      }
    })();
    return this.audioReady;
  }

  async warm() {
    await Promise.all([this.prepare(), this.prepareAudio()]);
  }

  async acquire(signal: AbortSignal) {
    signal.throwIfAborted();
    const audio = this.prepareAudio();
    // Invoke resume in the original click/key handler, before awaiting permission
    // or a network request, so browsers can use that user activation.
    const resume =
      this.context?.state !== "running" ? this.context?.resume() : undefined;
    const [stream, context] = await Promise.all([
      this.prepare(),
      audio,
      resume,
    ]);
    signal.throwIfAborted();
    if (this.disposed)
      throw new DOMException("Microphone closed", "AbortError");
    if (this.leased) throw new Error("The microphone is already in use.");
    this.leased = true;
    let released = false;
    return {
      stream,
      context,
      release: () => {
        if (released) return;
        released = true;
        this.leased = false;
      },
    };
  }

  dispose() {
    this.disposed = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.context = null;
    this.audioReady = null;
  }
}
