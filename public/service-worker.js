const CACHE_NAME = 'alt-text-generator-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/full-bleed-icon-16.png',
  '/icons/full-bleed-icon-32.png',
  '/icons/full-bleed-icon-48.png',
  '/icons/full-bleed-icon-96.png',
  '/icons/full-bleed-icon-128.png',
  '/icons/full-bleed-icon-512.png',
  '/icons/gen-alt-text.svg',
  '/icons/favicon.ico'
];

// Development mode - disable caching
const DEVELOPMENT_MODE = true;

// Install event - cache assets only if not in development mode
self.addEventListener('install', event => {
  if (!DEVELOPMENT_MODE) {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('Opened cache');
          return cache.addAll(urlsToCache);
        })
    );
  } else {
    console.log('Development mode: Skipping cache installation');
    self.skipWaiting();
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  if (DEVELOPMENT_MODE) {
    // Clear all caches in development mode
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('Development mode: All caches cleared');
        return self.clients.claim();
      })
    );
  } else {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  }
});

// Fetch event - always fetch from network in development mode
self.addEventListener('fetch', event => {
  // Skip for API requests
  if (event.request.url.includes('cloudfunctions.net')) {
    return;
  }

  if (DEVELOPMENT_MODE) {
    // Development mode: Always fetch from network, never use cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          console.log('Development mode: Fetched from network:', event.request.url);
          return response;
        })
        .catch(error => {
          console.error('Network fetch failed:', error);
          // Only serve offline page for HTML requests
          if (event.request.mode === 'navigate' || 
              (event.request.method === 'GET' && 
               event.request.headers.get('accept').includes('text/html'))) {
            return caches.match('/offline.html');
          }
          throw error;
        })
    );
  } else {
    // Production mode: Use cache-first strategy
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // Cache hit - return response
          if (response) {
            return response;
          }
          
          // Clone the request because it's a one-time-use stream
          const fetchRequest = event.request.clone();
          
          return fetch(fetchRequest)
            .then(response => {
              // Check if we received a valid response
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Clone the response because it's a one-time-use stream
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
                
              return response;
            })
            .catch(() => {
              // Network error, serve the offline page for HTML requests
              if (event.request.mode === 'navigate' || 
                  (event.request.method === 'GET' && 
                   event.request.headers.get('accept').includes('text/html'))) {
                return caches.match('/offline.html');
              }
            });
        })
    );
  }
}); 