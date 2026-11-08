import WebSocket from "ws";
import { z } from "zod";

const frameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("audio"),
    data: z.object({
      audio: z.string().max(3_000_000),
      content_type: z.string(),
    }),
  }),
  z.object({
    type: z.literal("event"),
    data: z.object({ event_type: z.string() }),
  }),
  z.object({ type: z.literal("error"), data: z.unknown() }),
]);
/** Each yield is one complete short MP3 utterance, never an arbitrary codec fragment. */
export class SarvamNarrator {
  private socket: WebSocket;
  private ready: Promise<void>;
  private pending: {
    resolve: (audio: string) => void;
    reject: (error: Error) => void;
    chunks: Buffer[];
    bytes: number;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stop: () => void;
  constructor(
    key: string,
    speaker: string,
    language: "en-IN" | "hi-IN",
    private signal: AbortSignal,
    pace = 1.15,
  ) {
    this.socket = new WebSocket(
      "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash&send_completion_event=true",
      {
        headers: { "Api-Subscription-Key": key },
        handshakeTimeout: 10_000,
        maxPayload: 3_000_000,
      },
    );
    this.stop = () => this.close();
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("open", () => {
        if (signal.aborted) {
          reject(new Error("Narration stopped."));
          this.close();
          return;
        }
        this.socket.send(
          JSON.stringify({
            type: "config",
            data: {
              speaker,
              language_code: language,
              speech_sample_rate: 24000,
              output_audio_codec: "mp3",
              pace,
            },
          }),
        );
        resolve();
      });
      this.socket.once("error", () =>
        reject(
          new Error("Teacher voice could not connect. Check Sarvam setup."),
        ),
      );
      this.socket.once("close", () =>
        reject(new Error("Teacher voice connection closed.")),
      );
    });
    // Observe early handshake failure even before the first text unit is ready.
    void this.ready.catch(() => {});
    this.socket.on("error", () => this.fail());
    this.socket.on("close", () => this.fail());
    this.socket.on("message", (bytes) => {
      if (!this.pending || signal.aborted) return;
      try {
        const message = frameSchema.parse(JSON.parse(bytes.toString()));
        if (message.type === "error") {
          this.fail();
          return;
        }
        if (message.type === "audio") {
          if (
            !/audio\/(mpeg|mp3)/i.test(message.data.content_type) ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(message.data.audio)
          )
            throw new Error("Unsupported audio.");
          const chunk = Buffer.from(message.data.audio, "base64");
          this.pending.bytes += chunk.length;
          if (this.pending.bytes > 2_000_000)
            throw new Error("Audio too large.");
          this.pending.chunks.push(chunk);
        } else if (message.data.event_type === "final") {
          const pending = this.pending;
          this.pending = null;
          clearTimeout(this.timer);
          if (!pending.bytes)
            pending.reject(new Error("Teacher voice returned no audio."));
          else
            pending.resolve(Buffer.concat(pending.chunks).toString("base64"));
        }
      } catch {
        this.fail();
      }
    });
    signal.addEventListener("abort", this.stop, { once: true });
    if (signal.aborted) this.close();
  }
  async speak(text: string) {
    this.signal.throwIfAborted();
    await this.ready;
    this.signal.throwIfAborted();
    if (this.pending) throw new Error("Narration must be serialized.");
    if (!text.trim() || text.length > 2500)
      throw new Error("Invalid narration length.");
    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject, chunks: [], bytes: 0 };
      this.timer = setTimeout(() => this.fail(), 20_000);
      this.socket.send(JSON.stringify({ type: "text", data: { text } }));
      this.socket.send(JSON.stringify({ type: "flush" }));
    });
  }
  private fail() {
    clearTimeout(this.timer);
    this.pending?.reject(
      new Error(
        "Teacher voice is unavailable. The written reply is preserved.",
      ),
    );
    this.pending = null;
  }
  close() {
    this.fail();
    this.signal.removeEventListener("abort", this.stop);
    if (this.socket.readyState === WebSocket.CONNECTING)
      this.socket.terminate();
    else this.socket.close();
  }
}
