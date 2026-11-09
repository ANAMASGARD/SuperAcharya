import { readFileSync } from "node:fs";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

const code = readFileSync(new URL("./pwa-worker.js", import.meta.url), "utf8");
let listeners: Record<string, (event: Record<string, unknown>) => void>;
let stored: Map<string, Response>;
const cache = {
  addAll: vi.fn(),
  match: vi.fn(),
  put: vi.fn(),
  keys: vi.fn(),
  delete: vi.fn(),
};
const fetcher = vi.fn();
const deleteCache = vi.fn();
const skipWaiting = vi.fn();
function dispatch(type: string, values: Record<string, unknown> = {}) {
  let result: Promise<Response> | undefined;
  let work: Promise<unknown> | undefined;
  const listener = listeners[type];
  if (!listener) throw new Error(`Missing listener: ${type}`);
  listener({
    ...values,
    respondWith: (value: Promise<Response>) => {
      result = value;
    },
    waitUntil: (value: Promise<unknown>) => {
      work = value;
    },
  });
  return { result, work };
}
const request = (path: string, extra = {}) => ({
  url: `https://example.test/app/${path}`,
  method: "GET",
  mode: "cors",
  ...extra,
});
beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  listeners = {};
  cache.addAll.mockResolvedValue(undefined);
  cache.match.mockImplementation(async (req: { url: string }) =>
    stored.get(req.url),
  );
  cache.put.mockImplementation(async (req: { url: string }, value: Response) =>
    stored.set(req.url, value),
  );
  cache.keys.mockImplementation(async () =>
    [...stored.keys()].map((url) => ({ url })),
  );
  cache.delete.mockResolvedValue(true);
  vm.runInNewContext(code, {
    URL,
    Response,
    fetch: fetcher,
    self: {
      registration: { scope: "https://example.test/app/" },
      addEventListener: (
        name: string,
        listener: (typeof listeners)[string],
      ) => {
        listeners[name] = listener;
      },
      skipWaiting,
    },
    caches: {
      open: async () => cache,
      match: async (url: string) => stored.get(url),
      keys: async () => ["other-app", "acharya-public-old"],
      delete: deleteCache,
    },
  });
});
describe("public-only PWA worker", () => {
  it("precaches scoped public files and leaves activation under user control", async () => {
    await dispatch("install").work;
    expect(cache.addAll.mock.calls[0]?.[0]).toContain(
      "https://example.test/app/offline.html",
    );
    expect(
      cache.addAll.mock.calls[0]?.[0].some((url: string) =>
        url.includes("whiteboard"),
      ),
    ).toBe(false);
    expect(skipWaiting).not.toHaveBeenCalled();
    await dispatch("activate").work;
    expect(deleteCache).toHaveBeenCalledExactlyOnceWith("acharya-public-old");
    dispatch("message", { data: { type: "ACTIVATE_UPDATE" } });
    expect(skipWaiting).toHaveBeenCalledOnce();
  });
  it.each([
    "api/teacher-stream",
    "api/actions/get-board",
    "api/auth/session",
    "private/image.png",
    "assets/file.js?token=private",
    "speech-capture.worklet.js",
  ])("does not intercept private or unapproved requests: %s", (path) => {
    expect(
      dispatch("fetch", { request: request(path) }).result,
    ).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not intercept mutations or cross-origin assets", () => {
    expect(
      dispatch("fetch", {
        request: request("assets/main-hash.js", { method: "POST" }),
      }).result,
    ).toBeUndefined();
    expect(
      dispatch("fetch", {
        request: request("assets/main-hash.js", {
          url: "https://other.test/assets/main.js",
        }),
      }).result,
    ).toBeUndefined();
  });
  it("never caches authenticated navigation and uses a scoped offline fallback on network failure", async () => {
    const privatePage = new Response("private lesson");
    fetcher.mockResolvedValueOnce(privatePage);
    expect(
      await dispatch("fetch", {
        request: request("whiteboard/id", { mode: "navigate" }),
      }).result,
    ).toBe(privatePage);
    expect(cache.put).not.toHaveBeenCalled();
    stored.set(
      "https://example.test/app/offline.html",
      new Response("<html><head></head><body>Offline</body></html>"),
    );
    fetcher.mockRejectedValueOnce(new Error("offline"));
    const fallback = await dispatch("fetch", {
      request: request("whiteboard/id", { mode: "navigate" }),
    }).result;
    expect(fallback?.status).toBe(503);
    expect(await fallback?.text()).toContain('<base href="/app/">');
  });
  it("caches public assets for reuse without caching private response bodies", async () => {
    const response = new Response("code", {
      headers: { "Content-Type": "application/javascript" },
    });
    Object.defineProperty(response, "type", { value: "basic" });
    fetcher.mockResolvedValue(response);
    await dispatch("fetch", { request: request("assets/main-hash.js") }).result;
    expect(cache.put).toHaveBeenCalledOnce();
    await dispatch("fetch", { request: request("assets/main-hash.js") }).result;
    expect(fetcher).toHaveBeenCalledOnce();
    for (const headers of [
      { "cache-control": "private" },
      { "cache-control": "no-store" },
      { "content-type": "text/html" },
    ]) {
      const blocked = new Response("private", { headers });
      Object.defineProperty(blocked, "type", { value: "basic" });
      fetcher.mockResolvedValue(blocked);
      await dispatch("fetch", { request: request("assets/other-hash.js") })
        .result;
    }
    expect(cache.put).toHaveBeenCalledOnce();
  });
});
