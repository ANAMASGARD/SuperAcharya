// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startCapture } from "@/lib/speech/capture";
import { openSpeechStream } from "@/lib/speech/stream";
import { transcribeClip } from "@/lib/speech/transcribe";

import VoicePreview from "./VoicePreview";
vi.mock("@/lib/speech/capture", () => ({ startCapture: vi.fn() }));
vi.mock("@/lib/speech/transcribe", () => ({ transcribeClip: vi.fn() }));
vi.mock("@/lib/speech/stream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/speech/stream")>()),
  openSpeechStream: vi.fn(),
}));
const liveFinish = vi.fn();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const stop = vi.fn();
const finish = vi.fn();
const result = {
  transcript: "one minus two sine theta",
  model: "prisma-v3.0" as const,
  truncated: false,
};
const phase = () =>
  host.querySelector(".board-voice")?.getAttribute("data-phase");
const primary = () =>
  host.querySelector<HTMLButtonElement>(".board-voice-primary")!;
const key = (type: string, repeat = false) =>
  act(async () => {
    document.body.dispatchEvent(
      new KeyboardEvent(type, {
        code: "Space",
        key: " ",
        repeat,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
const click = (name: string) =>
  act(async () => {
    host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!.click();
  });
beforeEach(async () => {
  vi.resetAllMocks();
  finish.mockResolvedValue(new Blob(["wav"]));
  vi.mocked(startCapture).mockResolvedValue({ finish, cancel: stop });
  vi.mocked(transcribeClip).mockResolvedValue(result);
  liveFinish.mockResolvedValue(result);
  vi.mocked(openSpeechStream).mockResolvedValue({
    finish: liveFinish,
    cancel: vi.fn(),
    send: vi.fn(),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<VoicePreview boardId="drawing" />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("microphone control", () => {
  it("captures immediately while STT connects and submits the first words after release", async () => {
    let connect!: (
      stream: Awaited<ReturnType<typeof openSpeechStream>>,
    ) => void;
    vi.mocked(openSpeechStream).mockImplementation(
      () =>
        new Promise((resolve) => {
          connect = resolve;
        }),
    );
    const send = vi.fn();
    const finalized = vi.fn();
    await act(async () =>
      root.render(<VoicePreview boardId="drawing" onFinalized={finalized} />),
    );
    await key("keydown");
    expect(startCapture).toHaveBeenCalledOnce();
    expect(phase()).toBe("active");
    const pcm = new Uint8Array([1, 2, 3, 4]);
    await act(async () => vi.mocked(startCapture).mock.calls[0]![3]?.(pcm));
    await key("keyup");
    expect(finish).toHaveBeenCalledOnce();
    expect(phase()).toBe("loading");
    expect(finalized).not.toHaveBeenCalled();
    await act(async () =>
      connect({ send, finish: liveFinish, cancel: vi.fn() }),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith(pcm);
    expect(liveFinish).toHaveBeenCalledOnce();
    expect(finalized).toHaveBeenCalledOnce();
    expect(phase()).toBe("paused");
  });
  it("hands off only a successful final recording once and shares its ID with manual Send", async () => {
    const finalized = vi.fn();
    await act(async () =>
      root.render(<VoicePreview boardId="drawing" onFinalized={finalized} />),
    );
    await key("keydown");
    const update = vi.mocked(openSpeechStream).mock.calls[0]?.[2];
    await act(async () =>
      update?.({ ...result, transcript: "partial phrase" }),
    );
    expect(finalized).not.toHaveBeenCalled();
    await key("keyup");
    expect(finalized).toHaveBeenCalledTimes(1);
    const value = finalized.mock.calls[0]?.[0];
    expect(value).toMatchObject({ text: result.transcript });
    await act(async () =>
      root.render(<VoicePreview boardId="drawing" onFinalized={finalized} />),
    );
    expect(finalized).toHaveBeenCalledTimes(1);
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".board-voice-send")?.click(),
    );
    expect(finalized).toHaveBeenLastCalledWith(value);
  });
  it("keeps truncated transcripts for review without automatic handoff", async () => {
    const finalized = vi.fn();
    liveFinish.mockResolvedValue({ ...result, truncated: true });
    await act(async () =>
      root.render(<VoicePreview boardId="drawing" onFinalized={finalized} />),
    );
    await key("keydown");
    await key("keyup");
    expect(finalized).not.toHaveBeenCalled();
    expect(host.textContent).toContain(result.transcript);
    expect(
      host.querySelector<HTMLButtonElement>(".board-voice-send")?.disabled,
    ).toBe(true);
  });
  it("holds, stops on release, shows loading then the real transcript", async () => {
    let resolve!: (value: typeof result) => void;
    liveFinish.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await key("keydown");
    expect(phase()).toBe("active");
    await key("keydown", true);
    expect(startCapture).toHaveBeenCalledTimes(1);
    await key("keyup");
    expect(finish).toHaveBeenCalledTimes(1);
    expect(phase()).toBe("loading");
    await key("keydown");
    expect(startCapture).toHaveBeenCalledTimes(1);
    await act(async () => resolve(result));
    expect(phase()).toBe("paused");
    expect(host.textContent).toContain(result.transcript);
    await click("Start speaking");
    expect(phase()).toBe("active");
    await click("Pause and transcribe");
    expect(phase()).toBe("loading");
    await act(async () => resolve(result));
    expect(phase()).toBe("paused");
  });
  it("closes without accepting a late transcript", async () => {
    let resolve!: (value: typeof result) => void;
    liveFinish.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await key("keydown");
    await key("keyup");
    await click("Close speech");
    expect(vi.mocked(openSpeechStream).mock.calls[0]![1].aborted).toBe(true);
    await act(async () => resolve(result));
    expect(phase()).toBe("idle");
    expect(host.textContent).not.toContain(result.transcript);
  });
  it("cancels a permission request released before permission is granted", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof startCapture>>) => void;
    vi.mocked(startCapture).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await key("keydown");
    expect(phase()).toBe("requesting");
    await key("keyup");
    await act(async () => resolve({ finish, cancel: stop }));
    expect(stop).toHaveBeenCalled();
    expect(phase()).toBe("idle");
    expect(transcribeClip).not.toHaveBeenCalled();
  });
  it("discards capture on blur, dialog opening and unmount", async () => {
    await key("keydown");
    await act(async () => window.dispatchEvent(new Event("blur")));
    expect(stop).toHaveBeenCalled();
    expect(phase()).toBe("idle");
    await key("keydown");
    await act(async () =>
      root.render(<VoicePreview boardId="drawing" suspended />),
    );
    expect(phase()).toBe("idle");
    expect(transcribeClip).not.toHaveBeenCalled();
  });
  it("preserves an unsuccessful clip for an explicit retry", async () => {
    liveFinish.mockRejectedValueOnce(new Error("Try again"));
    await key("keydown");
    await key("keyup");
    expect(phase()).toBe("error");
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".board-voice-retry")!.click(),
    );
    expect(phase()).toBe("paused");
    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(transcribeClip).toHaveBeenCalledTimes(1);
  });
  it("handles denied permission and preserves Space in text inputs", async () => {
    vi.mocked(startCapture).mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );
    await key("keydown");
    expect(phase()).toBe("error");
    expect(host.textContent).toContain("permission was denied");
    const event = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    const input = document.createElement("textarea");
    host.append(input);
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
  it("clicks once to record hands-free and closes with the left control", async () => {
    await act(async () =>
      primary().dispatchEvent(
        new MouseEvent("click", { detail: 1, bubbles: true }),
      ),
    );
    expect(phase()).toBe("active");
    await act(async () =>
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 })),
    );
    expect(phase()).toBe("active");

    expect(phase()).toBe("active");
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".board-voice-close")!.click(),
    );
    expect(phase()).toBe("idle");
    expect(startCapture).toHaveBeenCalledTimes(1);
  });
  it("keeps Send unavailable and preserves the transcript until an LLM is connected", async () => {
    await key("keydown");
    await key("keyup");
    const send = host.querySelector<HTMLButtonElement>(
      '[aria-label="Send transcript"]',
    )!;
    expect(send.disabled).toBe(true);
    await act(async () => send.click());
    expect(host.textContent).toContain(result.transcript);
    expect(transcribeClip).not.toHaveBeenCalled();
    expect(host.querySelector(".board-voice-primary")).toBeNull();
    expect(
      host.querySelector(".board-voice-bar button")?.getAttribute("aria-label"),
    ).toBe("Close speech");
  });
});

it("releases the provider session when a clip is too short", async () => {
  finish.mockRejectedValue(new Error("Hold longer"));
  const cancelStream = vi.fn();
  vi.mocked(openSpeechStream).mockResolvedValue({
    finish: liveFinish,
    cancel: cancelStream,
    send: vi.fn(),
  });
  await key("keydown");
  await key("keyup");
  expect(phase()).toBe("error");
  expect(cancelStream).toHaveBeenCalled();
});

it("finalizes a long streamed session without a REST retry clip", async () => {
  finish.mockResolvedValue(null);
  await key("keydown");
  await act(async () =>
    vi.mocked(openSpeechStream).mock.calls[0]![2]({
      ...result,
      transcript: "First phrase. Second phrase.",
    }),
  );
  expect(host.textContent).toContain("First phrase. Second phrase.");
  expect(phase()).toBe("active");
  await key("keyup");
  expect(phase()).toBe("paused");
  expect(transcribeClip).not.toHaveBeenCalled();
});
it("keeps finalized phrases visible if a long stream disconnects", async () => {
  await key("keydown");
  await act(async () => vi.mocked(openSpeechStream).mock.calls[0]![2](result));
  await act(async () =>
    vi
      .mocked(openSpeechStream)
      .mock.calls[0]![3]?.(new Error("Connection lost")),
  );
  expect(phase()).toBe("error");
  expect(host.textContent).toContain(result.transcript);
  expect(host.textContent).toContain("Connection lost");
});

it("captures canvas Space before Excalidraw, releases outside the button, and ignores repeats", async () => {
  const canvas = document.createElement("canvas");
  host.append(canvas);
  const pan = vi.fn();
  document.addEventListener("keydown", pan);
  try {
    const down = new KeyboardEvent("keydown", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => canvas.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    expect(pan).not.toHaveBeenCalled();
    expect(phase()).toBe("active");
    await key("keydown", true);
    expect(startCapture).toHaveBeenCalledTimes(1);
    await act(async () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", bubbles: true }),
      ),
    );
    expect(phase()).toBe("paused");
    expect(finish).toHaveBeenCalledTimes(1);
  } finally {
    document.removeEventListener("keydown", pan);
  }
});

it("preserves editing, IME, modified shortcuts, dialog and button keyboard activation", async () => {
  for (const tag of ["input", "textarea", "button"]) {
    const target = document.createElement(tag);
    host.append(target);
    const event = new KeyboardEvent("keydown", {
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => target.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    target.remove();
  }
  for (const options of [
    { isComposing: true },
    { ctrlKey: true },
    { shiftKey: true },
  ]) {
    await act(async () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          bubbles: true,
          ...options,
        }),
      ),
    );
  }
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  host.append(dialog);
  await act(async () =>
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    ),
  );
  expect(startCapture).not.toHaveBeenCalled();
});

it("mobile Send finishes active recording and hands off the finalized result once", async () => {
  const finalized = vi.fn();
  await act(async () =>
    root.render(<VoicePreview boardId="drawing" onFinalized={finalized} />),
  );
  await act(async () => primary().click());
  expect(phase()).toBe("active");
  const send = host.querySelector<HTMLButtonElement>(".board-voice-send")!;
  expect(send.disabled).toBe(false);
  await act(async () => send.click());
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finalized).toHaveBeenCalledTimes(1);
  expect(finalized).toHaveBeenCalledWith(
    expect.objectContaining({ text: result.transcript }),
  );
});

it("keeps a teacher turn and its loading border across blur, visibility changes and dialogs", async () => {
  const interrupt = vi.fn();
  await act(async () =>
    root.render(
      <VoicePreview boardId="drawing" teacherBusy onInterrupt={interrupt} />,
    ),
  );
  await act(async () => {
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(interrupt).not.toHaveBeenCalled();
  expect(host.querySelector(".board-voice-loading-border")).not.toBeNull();
  await act(async () =>
    root.render(
      <VoicePreview
        boardId="drawing"
        teacherBusy
        suspended
        onInterrupt={interrupt}
      />,
    ),
  );
  expect(interrupt).not.toHaveBeenCalled();
});

it("does not discard finalized speech processing when focus changes", async () => {
  const finalized = vi.fn();
  let complete: (value: typeof result) => void = () => {};
  liveFinish.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await act(async () =>
    root.render(<VoicePreview boardId="drawing" onFinalized={finalized} />),
  );
  await key("keydown");
  await key("keyup");
  expect(phase()).toBe("loading");
  await act(async () => window.dispatchEvent(new Event("blur")));
  expect(phase()).toBe("loading");
  await act(async () => complete(result));
  expect(finalized).toHaveBeenCalledOnce();
});

it("collapses and expands a transcript without interrupting teaching or discarding finalized input", async () => {
  const finalized = vi.fn(),
    interrupted = vi.fn();
  await act(async () =>
    root.render(
      <VoicePreview
        boardId="drawing"
        onFinalized={finalized}
        onInterrupt={interrupted}
      />,
    ),
  );
  await key("keydown");
  await key("keyup");
  const interruptionCount = interrupted.mock.calls.length;
  await click("Collapse transcript");
  expect(
    host.querySelector<HTMLElement>(".board-voice-transcript-body")?.hidden,
  ).toBe(true);
  expect(
    host
      .querySelector('[aria-label="Expand transcript"]')
      ?.getAttribute("aria-expanded"),
  ).toBe("false");
  expect(host.textContent).toContain("Transcript ready.");
  expect(finalized).toHaveBeenCalledTimes(1);
  expect(interrupted).toHaveBeenCalledTimes(interruptionCount);
  await click("Expand transcript");
  expect(
    host.querySelector<HTMLElement>(".board-voice-transcript-body")?.hidden,
  ).toBe(false);
  expect(host.textContent).toContain(result.transcript);
  await click("Collapse transcript");
  await click("Start speaking");
  expect(
    host.querySelector(".board-voice-result")?.getAttribute("data-collapsed"),
  ).not.toBe("true");
});
