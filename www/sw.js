const CACHE_NAME = 'shift-hub-v31';
const urlsToCache = [
  './index.html',
  './styles.css',
  './constants.js',
  './utils.js',
  './state.js',
  './rotation.js',
  './payroll.js',
  './payrollTools.js',
  './charts.js',
  './calendar.js',
  './notifications.js',
  './shiftForm.js',
  './ui.js',
  './settings.js',
  './theme.js',
  './yearSelector.js',
  './dataExport.js',
  './backup.js',
  './motion.js',
  './onboarding.js',
  './app.js',
  './vendor/jspdf.umd.min.js',
  './vendor/lz-string.min.js',
  './vendor/qrcode.min.js',
  './vendor/jsQR.js',
  './manifest.json',
  './icon.png'
];

// Install Event: Cache files and force the new worker to take over immediately
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Activate Event: Delete any old, outdated caches so they don't get stuck
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) 
  );
});

// Fetch Event: "Network First, Fallback to Cache" Strategy.
// Only manage same-origin GET requests. Cross-origin calls (e.g. the remote
// tax-tables API) are left to the browser so their failures are handled by the
// caller's own try/catch instead of surfacing as service-worker fetch errors.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        // If network fetch is successful, update the cache with the newest version
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // If the network fails (offline), load from the cache
        return caches.match(event.request);
      })
  );
});
