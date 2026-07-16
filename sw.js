const CACHE_NAME = 'aroam-cache-v7';
const urlsToCache = [
    '/',
    '/catalog/',
    '/css/site.css',
    '/js/components.js',
    '/js/app.js',
    '/images/logo.png',
    '/js/lib/papaparse.min.js'
];

self.addEventListener('install', event => {
    // Skip waiting to activate immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Try to cache critical assets, but don't fail if some missing
                return cache.addAll(urlsToCache).catch(err => console.log('Cache addAll error', err));
            })
    );
});

self.addEventListener('fetch', event => {
    // Network First Strategy
    // Try network, fall back to cache if offline
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone response to cache it
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
