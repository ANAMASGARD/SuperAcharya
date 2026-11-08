/** Only the tab with the admitted stream receives audio. No audio is persisted. */
export class TeacherAudio {
  private queue: { data: string; done?: (played: boolean) => void }[] = [];
  private completed: ((played: boolean) => void) | undefined;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private generation: string | null = null;
  private nextSequence = 0;
  constructor(private notify: (blocked: boolean) => void) {}
  begin(generation: string) {
    this.stop();
    this.generation = generation;
  }
  enqueue(generation: string, sequence: number, audio: string) {
    if (generation !== this.generation || sequence !== this.nextSequence)
      return;
    this.nextSequence++;
    if (this.queue.length >= 40) {
      this.stop();
      return;
    }
    this.queue.push({ data: audio });
    void this.play();
  }
  playStep(generation: string, data: string): Promise<boolean> {
    if (generation !== this.generation) return Promise.resolve(false);
    return new Promise((done) => {
      this.queue.push({ data, done });
      void this.play();
    });
  }
  async play() {
    if (this.audio) {
      if (this.audio.paused)
        await this.audio
          .play()
          .then(() => this.notify(false))
          .catch(() => this.notify(true));
      return;
    }
    const unit = this.queue.shift();
    if (!unit) return;
    this.completed = unit.done;
    const bytes = Uint8Array.from(atob(unit.data), (c) => c.charCodeAt(0));
    this.url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    const audio = new Audio(this.url);
    // bulbul:v4-flash ignores provider loudness; use ordinary playback volume.
    audio.volume = 1;
    this.audio = audio;
    audio.onended = () => {
      this.completed?.(true);
      this.completed = undefined;
      this.clearCurrent();
      void this.play();
    };
    audio.onerror = () => {
      this.stop();
      this.notify(true);
    };
    await audio
      .play()
      .then(() => this.notify(false))
      .catch(() => {
        if (this.audio === audio) this.notify(true);
      });
  }
  private clearCurrent() {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = null;
    this.url = null;
  }
  stop() {
    this.generation = null;
    this.nextSequence = 0;
    this.queue.forEach((unit) => unit.done?.(false));
    this.queue = [];
    this.completed?.(false);
    this.completed = undefined;
    this.clearCurrent();
    this.notify(false);
  }
}
