/* Lexi PWA cache: bump CACHE_NAME when publishing a new shell/data version. */
'use strict';
const CACHE_NAME = 'lexi-v20-readable-type';
const BASE_URL = new URL('./', self.location.href);
const SHELL_PATHS = [
  './', './index.html', './styles.css', './theme.css', './theme.js', './app.js', './data.js', './toeic.js', './synonyms.js', './profile.js', './avatar-crop.js', './backup.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './apple-touch-icon.png', './favicon.svg'
];
const SHELL_URLS = SHELL_PATHS.map(path => new URL(path, BASE_URL).href);
const ASSET_BY_PATH = new Map(SHELL_URLS.map(href => [new URL(href).pathname, href]));
const INDEX_URL = new URL('./index.html', BASE_URL).href;
const NAVIGATION_PATHS = new Set([BASE_URL.pathname, new URL(INDEX_URL).pathname]);

async function validResponse(response, assetURL) {
  if (!response || response.status !== 200 || response.redirected) return false;
  if (response.type !== 'basic' && response.type !== 'default') return false;
  if (!response.url || new URL(response.url).origin !== BASE_URL.origin) return false;
  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  const path = new URL(assetURL).pathname;
  if (NAVIGATION_PATHS.has(path)) {
    if (!contentType.includes('text/html')) return false;
    // A login page can be HTTP 200. Only cache our explicitly marked app shell.
    const body = await response.clone().text();
    return /<html\b[^>]*\bdata-lexi-app(?:\s|=|>)/i.test(body);
  }
  if (path.endsWith('.js')) return /(?:javascript|ecmascript)/.test(contentType);
  if (path.endsWith('.css')) return contentType.includes('text/css');
  if (path.endsWith('.webmanifest')) return contentType.includes('json');
  if (path.endsWith('.png')) return contentType.includes('image/png');
  if (path.endsWith('.svg')) return contentType.includes('image/svg+xml');
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Validate the complete shell before changing any cache entries.
    const responses = await Promise.all(SHELL_URLS.map(async href => {
      const response = await fetch(new Request(href, {
        cache: 'reload', credentials: 'same-origin', mode: 'same-origin', redirect: 'error'
      }));
      if (!await validResponse(response, href)) throw new Error('Lexi shell is not ready: ' + new URL(href).pathname);
      return response;
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_URLS.map((href, index) => cache.put(href, responses[index])));
    // No skipWaiting(): an update must not replace a running lesson mid-session.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('lexi-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Fresh navigation HTML when connected, without storing auth pages or redirects.
    const response = await fetch(request);
    if (await validResponse(response, INDEX_URL)) {
      await Promise.all([
        cache.put(INDEX_URL, response.clone()),
        cache.put(BASE_URL.href, response.clone())
      ]);
    }
    return response;
  } catch {
    const fallback = await cache.match(INDEX_URL);
    if (fallback && await validResponse(fallback, INDEX_URL)) return fallback;
    return new Response('Lexi chưa sẵn sàng offline. Hãy kết nối mạng và mở lại ứng dụng một lần.', {
      status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
    });
  }
}

async function localAssetResponse(request, assetURL) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(assetURL);
  if (cached) return cached;
  const response = await fetch(request);
  if (await validResponse(response, assetURL)) await cache.put(assetURL, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin) return;
  // Never intercept API, authentication, or a sign-in return navigation.
  if(url.pathname.startsWith('/api/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname)||url.searchParams.has('backup'))return;
  // The cached shell is static and contains no account identity or progress.
  if (request.mode === 'navigate') {
    if (NAVIGATION_PATHS.has(url.pathname)) event.respondWith(navigationResponse(request));
    return;
  }
  const assetURL = ASSET_BY_PATH.get(url.pathname);
  if (assetURL && !NAVIGATION_PATHS.has(url.pathname)) event.respondWith(localAssetResponse(request, assetURL));
});

async function offlineReady() {
  const cache = await caches.open(CACHE_NAME);
  const present = await Promise.all(SHELL_URLS.map(async href => {
    const response = await cache.match(href);
    return validResponse(response, href);
  }));
  return present.every(Boolean);
}

self.addEventListener('message', event => {
  if (event.data !== 'APP_READY' && (!event.data || event.data.type !== 'APP_READY')) return;
  event.waitUntil((async () => {
    let ready = false;
    try { ready = await offlineReady(); } catch { /* Storage may be unavailable. */ }
    const reply = {type:'APP_READY', ready, version:CACHE_NAME};
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  })());
});

