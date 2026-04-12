// סלי Service Worker v2.0
// מותאם ל-GitHub Pages: /Shoping-list/

const CACHE_NAME = "sali-v2";
const BASE = "/Shoping-list";

const STATIC_FILES = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/manifest.json",
  BASE + "/icon-192.png",
  BASE + "/icon-512.png",
];

// ── INSTALL: cache static files ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove old caches ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for API, cache-first for static ──
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Skip non-GET and external APIs - always network
  if (event.request.method !== "GET") return;
  if (url.hostname.includes("firebase") ||
      url.hostname.includes("googleapis") ||
      url.hostname.includes("openfoodfacts") ||
      url.hostname.includes("workers.dev") ||
      url.hostname.includes("food.gov.il")) return;

  // For app files: cache-first, fallback to index.html for navigation
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200) return response;
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            return response;
          })
          .catch(() => {
            // Offline fallback: serve index.html for navigation requests
            if (event.request.mode === "navigate") {
              return caches.match(BASE + "/index.html");
            }
          });
      })
  );
});
