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
vi.mock("@/lib/speech/stream", () => ({ openSpeechStream: vi.fn() }));
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
