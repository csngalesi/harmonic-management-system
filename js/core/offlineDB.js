/**
 * HMS — Offline IndexedDB Wrapper
 * Persists songs, setlists, setlist-song relations, and audio blobs locally.
 * Exposed via window.HMSOfflineDB
 *
 * v2: added audio_blobs store
 */
(function () {
    'use strict';

    const DB_NAME    = 'hms-offline';
    const DB_VERSION = 2;          // bumped from 1 → 2 to trigger migration
    let _db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (_db) { resolve(_db); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('songs')) {
                    db.createObjectStore('songs', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('setlists')) {
                    db.createObjectStore('setlists', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('setlist_songs')) {
                    const ss = db.createObjectStore('setlist_songs', { keyPath: '_key' });
                    ss.createIndex('by_setlist', 'setlist_id', { unique: false });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
                // v2: audio blobs (delta-sync friendly)
                if (!db.objectStoreNames.contains('audio_blobs')) {
                    db.createObjectStore('audio_blobs', { keyPath: 'song_id' });
                }
            };

            req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    function tx(store, mode, fn) {
        return openDB().then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(store, mode);
            const objectStore = Array.isArray(store)
                ? store.reduce((acc, s) => { acc[s] = transaction.objectStore(s); return acc; }, {})
                : transaction.objectStore(store);
            transaction.onerror = (e) => reject(e.target.error);
            fn(objectStore, resolve, reject);
        }));
    }

    // ── Songs ──────────────────────────────────────────────────────
    const songs = {
        saveAll(records) {
            return tx('songs', 'readwrite', (store, resolve, reject) => {
                store.clear().onsuccess = () => {
                    let remaining = records.length;
                    if (remaining === 0) { resolve(); return; }
                    records.forEach(r => {
                        const req = store.put(r);
                        req.onsuccess = () => { if (--remaining === 0) resolve(); };
                        req.onerror   = (e) => reject(e.target.error);
                    });
                };
            });
        },

        getAll() {
            return tx('songs', 'readonly', (store, resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        getById(id) {
            return tx('songs', 'readonly', (store, resolve, reject) => {
                const req = store.get(id);
                req.onsuccess = (e) => resolve(e.target.result || null);
                req.onerror   = (e) => reject(e.target.error);
            });
        },
    };

    // ── Setlists ────────────────────────────────────────────────────
    const setlists = {
        saveAll(records) {
            return tx('setlists', 'readwrite', (store, resolve, reject) => {
                store.clear().onsuccess = () => {
                    let remaining = records.length;
                    if (remaining === 0) { resolve(); return; }
                    records.forEach(r => {
                        const req = store.put(r);
                        req.onsuccess = () => { if (--remaining === 0) resolve(); };
                        req.onerror   = (e) => reject(e.target.error);
                    });
                };
            });
        },

        getAll() {
            return tx('setlists', 'readonly', (store, resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror   = (e) => reject(e.target.error);
            });
        },
    };

    // ── Setlist Songs ───────────────────────────────────────────────
    const setlistSongs = {
        saveAll(records) {
            // records: [{setlist_id, song_id, position}]
            const keyed = records.map(r => ({ ...r, _key: `${r.setlist_id}::${r.song_id}` }));
            return tx('setlist_songs', 'readwrite', (store, resolve, reject) => {
                store.clear().onsuccess = () => {
                    let remaining = keyed.length;
                    if (remaining === 0) { resolve(); return; }
                    keyed.forEach(r => {
                        const req = store.put(r);
                        req.onsuccess = () => { if (--remaining === 0) resolve(); };
                        req.onerror   = (e) => reject(e.target.error);
                    });
                };
            });
        },

        getBySetlist(setlistId) {
            return tx('setlist_songs', 'readonly', (store, resolve, reject) => {
                const index = store.index('by_setlist');
                const req   = index.getAll(setlistId);
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror   = (e) => reject(e.target.error);
            });
        },
    };

    // ── Meta ────────────────────────────────────────────────────────
    const meta = {
        set(key, value) {
            return tx('meta', 'readwrite', (store, resolve, reject) => {
                const req = store.put({ key, value });
                req.onsuccess = () => resolve();
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        get(key) {
            return tx('meta', 'readonly', (store, resolve, reject) => {
                const req = store.get(key);
                req.onsuccess = (e) => resolve(e.target.result ? e.target.result.value : null);
                req.onerror   = (e) => reject(e.target.error);
            });
        },
    };

    // ── Audio Blobs (v2) ────────────────────────────────────────────
    // Each record: { song_id, blob, audio_url, size_bytes, cached_at }
    // audio_url stored as fingerprint for delta-sync: if it changes → re-download.
    const audioBlobs = {
        get(songId) {
            return tx('audio_blobs', 'readonly', (store, resolve, reject) => {
                const req = store.get(songId);
                req.onsuccess = (e) => resolve(e.target.result || null);
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        put(record) {
            // record: { song_id, blob, audio_url, size_bytes, cached_at }
            return tx('audio_blobs', 'readwrite', (store, resolve, reject) => {
                const req = store.put(record);
                req.onsuccess = () => resolve();
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        delete(songId) {
            return tx('audio_blobs', 'readwrite', (store, resolve, reject) => {
                const req = store.delete(songId);
                req.onsuccess = () => resolve();
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        getAll() {
            return tx('audio_blobs', 'readonly', (store, resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        clearAll() {
            return tx('audio_blobs', 'readwrite', (store, resolve, reject) => {
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror   = (e) => reject(e.target.error);
            });
        },

        /** Returns { count, totalBytes } */
        async getStats() {
            const all = await this.getAll();
            return {
                count:      all.length,
                totalBytes: all.reduce((s, r) => s + (r.size_bytes || 0), 0),
            };
        },
    };

    window.HMSOfflineDB = { songs, setlists, setlistSongs, meta, audioBlobs };
    console.info('[HMS] OfflineDB module loaded (v2 — audio_blobs store).');
})();
