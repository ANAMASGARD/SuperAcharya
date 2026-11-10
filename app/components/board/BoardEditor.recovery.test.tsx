// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const { navigate, callAction } = vi.hoisted(() => ({ navigate: vi.fn(), callAction: vi.fn() }));
vi.mock("@agent-native/core/client/hooks", () => ({
  callAction,
  writeClientAppState: vi.fn(),
  getBrowserTabId: () => "test-tab",
  useActionQuery: (name: string) => name === "list-boards"
    ? { data: { boards: [{ id: "bbbbbbbbbbbbbbbbbbbbb", title: "Broken", updatedAt: "2026-11-10" }, { id: "ooooooooooooooooooooo", title: "Other", updatedAt: "2026-11-10" }], latestBoardId: "bbbbbbbbbbbbbbbbbbbbb" } }
    : { error: new Error("Missing image"), refetch: vi.fn() },
}));
vi.mock("@agent-native/core/client/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("react-router", () => ({ useNavigate: () => navigate, useBlocker: () => ({ state: "unblocked" }) }));
vi.mock("@/components/pwa/PwaProvider", () => ({ usePwa: () => ({ helpOpen: false }) }));
vi.mock("./TeacherPanel", () => ({ default: () => null }));
vi.mock("@excalidraw/excalidraw", () => ({ useHandleLibrary: vi.fn(), CaptureUpdateAction: {} }));
import BoardEditor from "./BoardEditor";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("opens recovery choices without redirecting back to the failed board", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) => [...host.querySelectorAll("button")].find((node) => node.textContent === label)!;
  try {
    await act(async () => root.render(<BoardEditor boardId="bbbbbbbbbbbbbbbbbbbbb" />));
    await act(async () => button("whiteboard.open").click());
    expect(navigate).not.toHaveBeenCalled();
    expect(button("Broken · whiteboard.current").disabled).toBe(true);
    await act(async () => button("Other").click());
    expect(navigate).toHaveBeenLastCalledWith("/whiteboard/ooooooooooooooooooooo");
    await act(async () => button("whiteboard.open").click());
    callAction.mockResolvedValue({ id: "fresh" });
    await act(async () => button("whiteboard.new").click());
    expect(callAction).toHaveBeenCalledWith("create-board", expect.objectContaining({ title: "whiteboard.untitled" }));
    expect(navigate).toHaveBeenLastCalledWith("/whiteboard/fresh");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
