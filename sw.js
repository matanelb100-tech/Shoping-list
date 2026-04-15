/**
 * סלי – Service Worker v2.0
 * אסטרטגיה: Cache-first לנכסים סטטיים, Network-first לAPI
 */

const CACHE_NAME   = "sali-v2";
const OFFLINE_URL  = "/Shoping-list/";

// קבצים שנשמרים ב-cache בהתקנה
const PRECACHE = [
  "/Shoping-list/",
  "/Shoping-list/index.html",
  "/Shoping-list/manifest.json",
  "/Shoping-list/icon-192.png",
  "/Shoping-list/icon-512.png",
];

// ── INSTALL: שמור נכסים סטטיים ──
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: מחק caches ישנים ──
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: אסטרטגיית מטמון לפי סוג בקשה ──
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // 1. Firebase / Worker / Google Fonts → תמיד רשת (לא מטמן)
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("workers.dev") ||
    url.hostname.includes("gstatic.com")
  ) {
    return; // ברירת מחדל — fetch רגיל
  }

  // 2. HTML ראשי → Network-first, אחורה ל-cache
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // 3. שאר נכסים (CSS/JS/תמונות) → Cache-first, אחורה לרשת
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
