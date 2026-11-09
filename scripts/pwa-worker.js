/* Public assets only. Never cache documents, actions, auth, speech or private files. */
const CACHE = "acharya-public-__BUILD_ID__";
const base = new URL(self.registration.scope);
const offline = new URL("offline.html", base).href;
const publicFiles = [
  "offline.html",
  "favicon.png",
  "pwa/icon-192.png",
  "pwa/icon-512.png",
  "pwa/icon-180.png",
  "pwa/maskable-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(publicFiles.map((path) => new URL(path, base).href)),
      ),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("acharya-public-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  if (request.mode === "navigate") {
    // Never store authenticated HTML or replay a previous user's session.
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(offline);
        if (!cached) return Response.error();
        const html = (await cached.text()).replace(
          "<head>",
          `<head><base href="${base.pathname}">`,
        );
        return new Response(html, {
          status: 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }),
    );
    return;
  }
  const path = url.pathname.slice(base.pathname.length);
  const isPublic =
    publicFiles.includes(path) ||
    /^assets\/[\w./-]+\.(js|css|woff2?|ttf)$/.test(path) ||
    /^excalidraw-assets\/fonts\/[\w./-]+\.(woff2?|ttf)$/.test(path);
  if (!isPublic || url.search) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (
        response.ok &&
        response.type === "basic" &&
        !response.redirected &&
        !/no-store|private/i.test(
          response.headers.get("cache-control") || "",
        ) &&
        !/text\/html/i.test(response.headers.get("content-type") || "")
      ) {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          // Bound runtime storage while retaining the offline page and icons.
          const runtime = keys.filter(
            (key) =>
              !publicFiles.some((path) => key.url === new URL(path, base).href),
          );
          await Promise.all(
            runtime
              .slice(0, Math.max(0, runtime.length - 96))
              .map((key) => cache.delete(key)),
          );
        } catch {
          /* Storage quota/private browsing must not break online use. */
        }
      }
      return response;
    })(),
  );
});
