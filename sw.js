const CACHE_NAME = 'zenbot-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/api.js',
    '/js/audio.js',
    '/js/main.js',
    '/assets/meditation-bell.mp3',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap'
];

// Install event - caches static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(error => {
                console.error('Error in cache installation:', error);
            })
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip caching for OpenAI API calls
    if (event.request.url.includes('api.openai.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if found
                if (response) {
                    return response;
                }

                // Otherwise, fetch from network
                return fetch(event.request)
                    .then(response => {
                        // Don't cache if not a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response as it can only be consumed once
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    });
            })
            .catch(error => {
                console.error('Fetch error:', error);
                // You could return a custom offline page here
            })
    );
});

// Handle errors
self.addEventListener('error', event => {
    console.error('Service Worker error:', event.error);
});

// Optional: Add background sync for offline meditation generation requests
self.addEventListener('sync', event => {
    if (event.tag === 'meditation-sync') {
        event.waitUntil(
            // Handle syncing meditation requests when back online
            console.log('Background sync triggered')
        );
    }
});