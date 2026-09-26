// Dockside Deception service worker: makes the game installable + playable offline.
const CACHE = 'dockside-v1';
const CORE = [
  './',
  'index.html',
  'manifest.json',
  'halloween-mode.js',
  'halloween-loading.webp',
  'icon-192.png',
  'icon-512.png',
  'icon-180.png',
  'https://raw.githubusercontent.com/flaglermobilemarineservices/Dockyard-Deception-3d/backup-non-halloween-2026-09-22/index.html',
  'https://raw.githubusercontent.com/flaglermobilemarineservices/Dockyard-Deception-3d/main/halloween-mode.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(CORE.map((u) => c.add(u).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const STATIC_RE = /\.(js|css|png|webp|jpg|jpeg|glb|gltf|mp3|wav|ogg|json)(\?|$)/i;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App shell + code: network-first so updates always land, cache fallback offline.
  // (The page fetches code with ?v= timestamps — compare without the query.)
  const bare = req.url.split('?')[0];
  const isCore = CORE.some((u) => bare === u.split('?')[0] || bare === new URL(u, self.location.href).href.split('?')[0]);
  if (req.mode === 'navigate' || isCore) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          // Store under the query-stripped URL so ?v= timestamps share one entry.
          caches.open(CACHE).then((c) => c.put(bare, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./')))
    );
    return;
  }

  // Heavy static assets (models, audio, art): stale-while-revalidate.
  if (url.origin === self.location.origin && STATIC_RE.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});
