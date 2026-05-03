/* =============================================================
   糖尿病醣類計算器 — Service Worker
   - 靜態資源：cache-first
   - food-db.json：stale-while-revalidate
   - 其他：network-first，失敗回 cache
   ============================================================= */

const CACHE_VERSION = 'cc-v0.2.1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './food-db.json',
  './food-db.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png',
  './favicon.ico',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(err => {
        // 部分 icon 還沒生成時不要整個 install 失敗
        console.warn('SW addAll partial failure', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => !n.startsWith(CACHE_VERSION)).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨域：Cloudinary upload / Gist API → 直接 network（不 cache）
  if (url.origin !== location.origin) {
    return; // 不攔截，瀏覽器照走
  }

  // food-db.json: stale-while-revalidate
  if (url.pathname.endsWith('/food-db.json')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 靜態資源 cache-first
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    // 離線且沒 cache → 回 index 當 fallback（單頁 app）
    if (req.mode === 'navigate') {
      return caches.match('./index.html');
    }
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || networkPromise || Promise.reject(new Error('no source'));
}
