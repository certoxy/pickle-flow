const CACHE_NAME = 'pickleflow-shell-v3'
const APP_SHELL = ['/', '/install/', '/manifest.webmanifest', '/brand/pickleflow-icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const isNavigation = event.request.mode === 'navigate'
  const url = new URL(event.request.url)
  const isLocalAsset = url.origin === self.location.origin && !isNavigation

  if (isLocalAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)))
          }
          return response
        })
        return cached || network
      }),
    )
    return
  }

  event.respondWith(
    fetch(event.request, isNavigation ? { cache: 'no-store' } : undefined)
      .then((response) => {
        if (isNavigation && response.ok) {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)))
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  )
})
