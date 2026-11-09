/** At most current + next accepted step; one provider request at a time. */
export class NarrationBuffer {
  private pending = new Map<number, Promise<string | null>>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private synthesize: (text: string) => Promise<string | null>, private signal: AbortSignal) {}
  prepare(index: number, text: string) {
    if (this.pending.has(index)) return;
    const result = this.tail.then(() => {
      this.signal.throwIfAborted();
      return this.synthesize(text);
    });
    this.pending.set(index, result);
    this.tail = result.catch(() => {});
  }
  async take(index: number, text: string) {
    this.prepare(index, text);
    const result = await this.pending.get(index)!;
    this.pending.delete(index);
    return result;
  }
}
