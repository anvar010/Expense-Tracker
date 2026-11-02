/* Service worker. Caches the app shell and static assets only.
 * It NEVER caches /api/* or any non-GET request, so financial data is not stored in the HTTP cache. */
const VERSION = "v4";
const SHELL = `et-shell-${VERSION}`;
const STATIC = `et-static-${VERSION}`;
const PAGES = ["/dashboard", "/transactions", "/messages", "/accounts", "/budgets", "/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => Promise.allSettled(PAGES.map((p) => c.add(p)))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (![SHELL, STATIC].includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always straight to the network

  // Hashed build assets never change: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: network first, fall back to the cached page, then the dashboard shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && PAGES.includes(url.pathname)) (await caches.open(SHELL)).put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(req)) || (await cache.match("/dashboard")) || Response.error();
        }
      })(),
    );
  }
});

// Background Sync (where supported): wake any open window so it retries its local outbox.
self.addEventListener("sync", (event) => {
  if (event.tag === "et-sync") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "flush" }))),
    );
  }
});

// Push alerts for new debits/credits (sent by the server when an entry is added).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "New transaction", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: data.url || "/transactions" },
      });
      // An open app should show the new entry right away.
      for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) c.postMessage({ type: "flush" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/transactions";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url).catch(() => {}); return; }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
