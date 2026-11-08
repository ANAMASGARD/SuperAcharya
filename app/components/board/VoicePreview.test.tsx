// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import VoicePreview from "./VoicePreview";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const phase = () =>
  host.querySelector(".board-voice")?.getAttribute("data-phase");
const primary = () =>
  host.querySelector<HTMLButtonElement>(".board-voice-primary")!;
const key = (type: string, repeat = false) =>
  act(() => {
    primary().dispatchEvent(
      new KeyboardEvent(type, {
        code: "Space",
        key: " ",
        repeat,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<VoicePreview />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("voice preview interactions", () => {
  it("holds, pauses on release, resumes and closes without repeated keys restarting", () => {
    key("keydown");
    expect(phase()).toBe("active");
    key("keyup");
    expect(phase()).toBe("paused");
    key("keydown");
    expect(phase()).toBe("active");
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Close voice preview"]')!
        .click(),
    );
    expect(phase()).toBe("idle");
    key("keydown", true);
    expect(phase()).toBe("idle");
    key("keyup");
    key("keydown");
    expect(phase()).toBe("active");
  });
  it("explicit pause stays paused until the held input is released", () => {
    key("keydown");
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Pause voice preview"]')!
        .click(),
    );
    key("keydown", true);
    expect(phase()).toBe("paused");
    key("keyup");
    key("keydown");
    expect(phase()).toBe("active");
  });
  it("switches from pause to play and resumes until explicitly paused again", () => {
    key("keydown");
    key("keyup");
    const resume = () =>
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Resume voice preview"]',
      )!;
    expect(resume().classList.contains("board-voice-play")).toBe(true);
    act(() => resume().click());
    expect(phase()).toBe("active");
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Pause voice preview"]')!
        .click(),
    );
    expect(phase()).toBe("paused");
    expect(resume()).not.toBeNull();
  });
  it("pauses on window blur and on an app dialog", async () => {
    key("keydown");
    act(() => window.dispatchEvent(new Event("blur")));
    expect(phase()).toBe("paused");
    key("keydown");
    await act(async () => root.render(<VoicePreview suspended />));
    expect(phase()).toBe("paused");
    expect(host.querySelector(".board-voice")?.hasAttribute("hidden")).toBe(
      true,
    );
  });
  it("does not intercept Space outside the voice button", () => {
    const event = new KeyboardEvent("keydown", {
      code: "Space",
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    act(() => document.body.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(phase()).toBe("idle");
  });
  it("pauses pointer holds on cancellation and suppresses their trailing click", () => {
    primary().setPointerCapture = () => {};
    act(() =>
      primary().dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          bubbles: true,
        }),
      ),
    );
    expect(phase()).toBe("active");
    act(() =>
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })),
    );
    expect(phase()).toBe("paused");
    act(() =>
      primary().dispatchEvent(
        new MouseEvent("click", { detail: 1, bubbles: true }),
      ),
    );
    expect(phase()).toBe("paused");
  });
});
