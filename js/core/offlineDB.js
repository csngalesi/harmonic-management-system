/**
 * HMS — Offline IndexedDB Wrapper
 * Persists songs, setlists, and setlist-song relations locally.
 * Exposed via window.HMSOfflineDB
 */
(function () {
    'use strict';

    const DB_NAME    = 'hms-offline';
    const DB_VERSION = 1;
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

    window.HMSOfflineDB = { songs, setlists, setlistSongs, meta };
    console.info('[HMS] OfflineDB module loaded.');
})();
