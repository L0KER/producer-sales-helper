/* Producer Sales Helper — offline shell.
   Static app: cache the shell, serve it fast, refresh in the background. */

const VERSION = '1.1.0';
const CACHE = `psh-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-maskable.svg',
  './assets/js/app.js',
  './assets/js/actions.js',
  './assets/js/charts.js',
  './assets/js/demo.js',
  './assets/js/exporters.js',
  './assets/js/forms.js',
  './assets/js/icons.js',
  './assets/js/stats.js',
  './assets/js/store.js',
  './assets/js/telegram.js',
  './assets/js/util.js',
  './assets/js/views/analytics.js',
  './assets/js/views/catalog.js',
  './assets/js/views/crm.js',
  './assets/js/views/dashboard.js',
  './assets/js/views/deals.js',
  './assets/js/views/journal.js',
  './assets/js/views/partials.js',
  './assets/js/views/settings.js',
  './assets/js/views/tasks.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  // The data and the bot live outside the app shell.
  if (url.hostname === 'api.github.com' || url.hostname === 'api.telegram.org') return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;

  // Navigations: network first, cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    );
    return;
  }

  // Assets: serve from cache immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
