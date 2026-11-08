import { isSameRecord } from "@agent-native/core/save-conflict";
/** One writer per editor. Acknowledges only the snapshot actually sent. */
export class SaveQueue<T> {
  private current: T;
  private saved: T;
  private revision: string;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  error: unknown = null;
  constructor(
    initial: T,
    revision: string,
    private readonly write: (value: T, revision: string) => Promise<string>,
    private readonly changed: () => void,
    private readonly delay = 750,
  ) {
    this.current = initial;
    this.saved = initial;
    this.revision = revision;
  }
  get value() {
    return this.current;
  }
  get dirty() {
    return !isSameRecord(this.current, this.saved);
  }
  get saving() {
    return this.running !== null;
  }
  update(value: T) {
    if (isSameRecord(value, this.current)) return;
    this.current = value;
    this.changed();
    clearTimeout(this.timer);
    if (!this.error)
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, this.delay);
  }
  adopt(value: T, revision: string) {
    if (this.dirty || this.saving) return false;
    this.current = value;
    this.saved = value;
    this.revision = revision;
    this.error = null;
    this.changed();
    return true;
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.error = null;
    const work = async () => {
      while (this.dirty) {
        const sent = this.current;
        this.revision = await this.write(sent, this.revision);
        this.saved = sent;
      }
    };
    this.running = Promise.resolve()
      .then(work)
      .catch((error) => {
        this.error = error;
        throw error;
      })
      .finally(() => {
        this.running = null;
        this.changed();
      });
    this.changed();
    return this.running;
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
