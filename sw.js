/**
 * HMS — Service Worker
 * Caches the app shell for offline use.
 * Strategy: Cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME = 'hms-v43';



// App shell — all static assets needed to run offline
// IMPORTANT: URLs must include the same ?v= suffix used in index.html so that
// caches.match() finds these entries when the browser requests them.
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/main.css?v=15',
    '/js/core/harmonyEngine.js?v=13',
    '/js/core/chordShapes.js?v=13',
    '/js/core/audioEngine.js?v=22',
    '/js/core/melodyEngine.js?v=13',
    '/js/core/offlineDB.js?v=13',
    '/js/core/syncManager.js?v=13',
    '/js/supabase-client.js?v=13',
    '/js/auth.js?v=13',
    '/js/api.js?v=21',
    '/js/components/repertoire.js?v=24',
    '/js/components/player.js?v=15',
    '/js/components/analyzer.js?v=13',
    '/js/components/extractor.js?v=13',
    '/js/components/studies7.js?v=16',
    '/js/components/fretboard7.js?v=13',
    '/js/components/melodicStudies.js?v=13',
    '/js/components/harmonicMelodic.js?v=13',
    '/js/components/harmonicBass.js?v=13',
    '/js/app.js?v=10',
    // CDN libs
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cache local assets strictly; CDN assets best-effort
            const local  = APP_SHELL.filter(u => u.startsWith('/') || u.startsWith('https://fonts'));
            const cdnAll = APP_SHELL.filter(u => !u.startsWith('/') && !u.startsWith('https://fonts'));

            return Promise.all([
                cache.addAll(local),
                ...cdnAll.map(url =>
                    cache.add(url).catch(() => console.warn('[SW] Could not cache:', url))
                ),
            ]);
        }).then(() => self.skipWaiting())
    );
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy:
// - Supabase API calls  → network-only  (let api.js handle offline fallback)
// - HMS JS files (?v=)  → network-first (always get latest code; cache as fallback offline)
// - Everything else     → cache-first   (CSS, HTML, CDN libs — stable assets)
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Let Supabase calls pass through (offline fallback handled by api.js)
    // Storage URLs (audio, images) bypass SW entirely to avoid opaque response
    // issues with <audio> elements on mobile Chrome.
    if (url.includes('supabase.co')) {
        if (url.includes('/storage/v1/object/')) {
            return; // Let browser handle storage requests directly (no SW)
        }
        event.respondWith(fetch(event.request).catch(() => new Response(
            JSON.stringify({ error: 'offline' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        )));
        return;
    }

    // Tone.js — network-first (large library, skip if no cache)
    if (url.includes('Tone.js')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // HMS JS files (have ?v= query param from this domain) — network-first.
    // This guarantees code changes are applied immediately after deploy,
    // without needing to bump the cache version or clear the SW cache manually.
    const isHmsJs = url.includes('/js/') && url.includes('?v=');
    if (isHmsJs) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Update cache with fresh copy
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request)) // Offline fallback
        );
        return;
    }

    // Everything else: cache-first (CSS, HTML, CDN libs)
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Cache successful GET responses
                if (response && response.status === 200 && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // For navigation requests, return the cached index.html
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
