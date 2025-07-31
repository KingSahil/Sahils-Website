// Service Worker for Sahil's Website
const CACHE_VERSION = '2.1.0';
const CACHE_NAME = `sahil-website-v${CACHE_VERSION}`;
const STATIC_CACHE = `sahil-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `sahil-dynamic-v${CACHE_VERSION}`;

// Files to cache for offline use
const STATIC_FILES = [
  '/',
  '/index.html',
  '/main.js',
  '/style.css',
  '/explainer.html',
  '/favicon.svg',
  '/icon.svg',
  '/icon-512.svg',
  '/manifest.json'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing Service Worker v${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve cached files or fetch from network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            return cachedResponse;
          }

          // If not in cache, fetch from network
          return fetch(request)
            .then((networkResponse) => {
              // Don't cache non-successful responses
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }

              // Clone the response before caching
              const responseToCache = networkResponse.clone();

              // Cache dynamic content
              caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                  console.log('[SW] Caching dynamic content:', request.url);
                  cache.put(request, responseToCache);
                });

              return networkResponse;
            })
            .catch((error) => {
              console.error('[SW] Fetch failed:', error);
              
              // Return offline page for navigation requests
              if (request.destination === 'document') {
                return caches.match('/index.html');
              }
              
              // Return a generic offline response for other requests
              return new Response(
                JSON.stringify({ error: 'Network error', offline: true }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
  }
});

// Background sync for when connection is restored
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Sync user data when connection is restored
      syncUserData()
    );
  }
});

// Function to sync user data
async function syncUserData() {
  try {
    // Check if we have any pending data to sync
    const cache = await caches.open(DYNAMIC_CACHE);
    const pendingRequests = await cache.keys();
    
    // Process any pending sync operations
    for (const request of pendingRequests) {
      if (request.url.includes('sync-data')) {
        try {
          await fetch(request);
          await cache.delete(request);
          console.log('[SW] Synced pending data:', request.url);
        } catch (error) {
          console.error('[SW] Failed to sync data:', error);
        }
      }
    }
    
    // Send message to client that sync is complete
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        timestamp: Date.now()
      });
    });
    
    console.log('[SW] Background sync completed successfully');
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New update available!',
    icon: '/icon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Open App',
        icon: '/icon.svg'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/favicon.svg'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Sahil\'s Website', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME,
      static: STATIC_CACHE,
      dynamic: DYNAMIC_CACHE
    });
  }
});
