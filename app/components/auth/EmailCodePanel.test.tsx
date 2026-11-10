// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const { requestAuth, enterApp } = vi.hoisted(() => ({
  requestAuth: vi.fn(),
  enterApp: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  requestAuth,
  enterApp,
  resolveResumeHref: () => "/whiteboard",
  authErrorMessage: (_: unknown, fallback: string) => fallback,
}));
vi.mock("@agent-native/core/client/i18n", () => ({
  useT: () => (_: string, options: { defaultValue: string }) =>
    options.defaultValue,
}));
import { EmailCodePanel } from "./EmailCodePanel";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  vi.clearAllMocks();
});
it("sends once, shows delivery failure and permits retry without entering the app", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const back = vi.fn();
  requestAuth.mockResolvedValue({ ok: false, data: {}, status: 503 });
  try {
    await act(async () =>
      root.render(<EmailCodePanel purpose="sign-in" onBack={back} />),
    );
    expect(requestAuth).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "couldn't send",
    );
    expect(enterApp).not.toHaveBeenCalled();
    requestAuth.mockResolvedValue({ ok: true, data: {}, status: 200 });
    const buttons = [...host.querySelectorAll("button")];
    await act(async () =>
      buttons.find((b) => b.textContent === "Send another code")!.click(),
    );
    expect(requestAuth).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Code sent",
    );
    expect(
      buttons.find((b) => b.textContent?.startsWith("Resend"))?.disabled,
    ).toBe(true);
    await act(async () =>
      buttons.find((b) => b.textContent === "Back to sign in")!.click(),
    );
    expect(back).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it("does not resend signup mail automatically", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <EmailCodePanel
          purpose="verification"
          email="student@example.com"
          password="synthetic"
          onBack={vi.fn()}
          onTwoFactor={vi.fn()}
        />,
      ),
    );
    expect(requestAuth).not.toHaveBeenCalled();
    expect(host.querySelector("input")?.autocomplete).toBe("one-time-code");
    expect(enterApp).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
