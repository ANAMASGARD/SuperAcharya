import { beforeEach, expect, it, vi } from "vitest";
import { H3Event } from "h3";
import { getSession } from "@agent-native/core/server";
import { ownedBoard } from "../whiteboards";
import { SarvamNarrator } from "./providers/sarvam";
import handler from "../../routes/api/teacher-voice-preview.post";
vi.mock("@agent-native/core/server", async original => ({ ...(await original<typeof import("@agent-native/core/server")>()), getSession: vi.fn() }));
vi.mock("../whiteboards", () => ({ ownedBoard: vi.fn() }));
vi.mock("./config", () => ({ teacherCredential: vi.fn(async () => "test-key") }));
const speak = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn());
vi.mock("./providers/sarvam", () => ({ SarvamNarrator: vi.fn(class { speak = speak; close = close; }) }));
function request(voice = "shubh_enhi_ads", origin = "http://localhost") {
  return new H3Event(new Request("http://localhost/api/teacher-voice-preview", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ boardId: "123456789012345678901", voice }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ email: "preview@example.test" });
  vi.mocked(ownedBoard).mockReset();
  speak.mockResolvedValue(Buffer.from("synthetic audio fixture").toString("base64"));
});
it("requires authentication, same origin and supported voice before provider work", async () => {
  vi.mocked(getSession).mockResolvedValue(null);
  await expect(handler(request())).rejects.toMatchObject({ status: 401 });
  vi.mocked(getSession).mockResolvedValue({ email: "preview@example.test" });
  await expect(handler(request("shubh_enhi_ads", "https://other.test"))).rejects.toMatchObject({ status: 403 });
  await expect(handler(request("invented"))).rejects.toMatchObject({ status: 400 });
  expect(SarvamNarrator).not.toHaveBeenCalled();
});
it("authorizes the drawing and closes the narrator after returning binary audio", async () => {
  const response = await handler(request());
  expect(ownedBoard).toHaveBeenCalledWith("preview@example.test", "123456789012345678901");
  expect(response.headers.get("content-type")).toBe("audio/mpeg");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(close).toHaveBeenCalledOnce();
});
it("rejects foreign boards before speech synthesis", async () => {
  vi.mocked(ownedBoard).mockRejectedValueOnce(new Error("Not owned"));
  await expect(handler(request())).rejects.toThrow("Not owned");
  expect(SarvamNarrator).not.toHaveBeenCalled();
});
