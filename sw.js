// סלי - Service Worker v1.2
const CACHE = 'sali-v1.2';
const FILES = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e =>
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  )
);

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
);

self.addEventListener('fetch', e => {
  // Firebase ו-API חיצוני - תמיד מהרשת
  if (e.request.url.includes('firebase') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('openfoodfacts') ||
      e.request.url.includes('workers.dev')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
