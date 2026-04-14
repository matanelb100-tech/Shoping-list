// סלי Service Worker v3.1
// Offline-first, GitHub Pages /Shoping-list/

const CACHE = "sali-v4";
const BASE  = "/Shoping-list";

const STATIC = [
  BASE + "/",
  BASE + "/index.html",
  BASE + "/manifest.json",
  BASE + "/icon-192.png",
  BASE + "/icon-512.png",
];

// INSTALL
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE - clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// FETCH strategy
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Always network for external APIs (Firebase, OFF, Worker)
  const externalHosts = [
    "firebaseio.com", "googleapis.com", "firebaseapp.com",
    "openfoodfacts.org", "workers.dev", "food.gov.il",
    "fonts.googleapis.com", "fonts.gstatic.com"
  ];
  if (externalHosts.some(h => url.hostname.includes(h))) return;

  // Navigation requests → serve index.html (SPA fallback)
  // Fix: normalize both with and without trailing slash
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .catch(() =>
          caches.match(BASE + "/index.html")
            .then(r => r || caches.match(BASE + "/"))
        )
    );
    return;
  }

  // Static files → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      // Also try with/without trailing slash for root
      const altUrl = url.pathname === BASE + "/" ? BASE + "/index.html"
                   : url.pathname === BASE      ? BASE + "/index.html"
                   : null;
      const altMatch = altUrl ? caches.match(altUrl) : Promise.resolve(null);
      return altMatch.then(alt => {
        if (alt) return alt;
        return fetch(e.request).then(res => {
          if (res && res.status === 200 && res.type !== "opaque") {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => caches.match(BASE + "/index.html"));
      });
    })
  );
});
