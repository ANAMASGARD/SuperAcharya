// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PwaProvider, usePwa } from "./PwaProvider";
vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (key: string) => key,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
function Install() {
  const pwa = usePwa();
  return (
    <button onClick={pwa.install}>
      {pwa.installed ? "Installed" : "Install"}
    </button>
  );
}
beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <PwaProvider>
        <Install />
      </PwaProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
it("uses the browser install prompt on a user gesture and reacts to installation", async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    },
  );
  await act(async () => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  await act(async () => host.querySelector("button")?.click());
  expect(prompt).toHaveBeenCalledOnce();
  await act(async () => window.dispatchEvent(new Event("appinstalled")));
  expect(host.textContent).toContain("Installed");
});
it("provides install guidance when a native prompt is unavailable", async () => {
  await act(async () => host.querySelector("button")?.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "pwa.instructions",
  );
});
it("shows truthful offline feedback and clears it when connection returns", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event("offline")));
  expect(host.textContent).toContain("pwa.offline");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(host.textContent).not.toContain("pwa.offline");
});
