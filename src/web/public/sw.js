// Adapted from Pi Web 0.8.8. Runtime/API traffic is never cached.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `aili-pi-web-static-${VERSION}`;
const PRECACHE = ["/offline.html", "/manifest.webmanifest"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("aili-pi-web-static-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const request = event.request; if (request.method !== "GET") return;
  const url = new URL(request.url); if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  if (request.mode === "navigate") { event.respondWith(fetch(request).catch(async () => (await caches.match("/offline.html")) || Response.error())); return; }
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) event.respondWith(caches.match(request).then(async (cached) => { if (cached) return cached; const response = await fetch(request); if (response.ok && response.type === "basic") await (await caches.open(CACHE)).put(request, response.clone()); return response; }));
});
