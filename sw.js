'use strict';

const SONA_OS_SHELL_CACHE = 'sona-os-shell-v22';
const SONA_OS_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/sona-os.css',
  './js/config.js',
  './js/loader.js',
  './js/api.js',
  './js/bestand.js',
  './js/controlling.js',
  './js/einkauf.js',
  './js/rezeptur.js',
  './js/operations.js',
  './js/app.js',
  './assets/sona-logo.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SONA_OS_SHELL_CACHE).then((cache) => cache.addAll(SONA_OS_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SONA_OS_SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // Strictly bypass cache for Apps Script / API calls
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.search.includes('action=')
  ) {
    return;
  }

  // Only cache same-origin static shell files (network-first for freshness, cache fallback offline)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SONA_OS_SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
