/* Service worker: network-first so updates land immediately,
   cache fallback so the game still works above the tree line. */

const CACHE = 'randonnee-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './src/ui.js',
  './src/game.js',
  './src/trail.js',
  './src/render.js',
  './src/dice.js',
  './src/audio.js',
  './src/storage.js',
  './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match('./index.html'))
      )
  );
});
