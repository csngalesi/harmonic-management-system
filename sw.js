/**
 * HMS — Service Worker
 * Caches the app shell for offline use.
 * Strategy: Cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME = 'hms-v21';

// App shell — all static assets needed to run offline
const APP_SHELL = [
    '/',
    '/index.html',
    '/css/main.css',
    '/js/core/harmonyEngine.js',
    '/js/core/chordShapes.js',
    '/js/core/audioEngine.js',
    '/js/core/melodyEngine.js',
    '/js/core/offlineDB.js',
    '/js/core/syncManager.js',
    '/js/supabase-client.js',
    '/js/auth.js',
    '/js/api.js',
    '/js/components/repertoire.js',
    '/js/components/player.js',
    '/js/components/analyzer.js',
    '/js/components/extractor.js',
    '/js/components/studies7.js',
    '/js/components/fretboard7.js',
    '/js/components/melodicStudies.js',
    '/js/components/harmonicMelodic.js',
    '/js/components/harmonicBass.js',
    '/js/app.js',
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
// - Supabase API calls → network-only (let api.js handle offline fallback)
// - Everything else → cache-first with network fallback
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Let Supabase calls pass through (offline fallback handled by api.js)
    if (url.includes('supabase.co')) {
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

    // Everything else: cache-first
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
