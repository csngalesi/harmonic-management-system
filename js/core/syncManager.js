/**
 * HMS — Sync Manager
 * Downloads all repertoire data from Supabase and persists it in IndexedDB.
 * v2: adds syncAudio() — delta-sync of MP3 blobs into the audio_blobs store.
 * Exposed via window.HMSSyncManager
 */
(function () {
    'use strict';

    const db  = () => window.supabaseClient;
    const idb = () => window.HMSOfflineDB;

    const SyncManager = {

        /**
         * Full sync: songs (with lyrics) + setlists + setlist_songs
         * @param {Function} onProgress  callback(step, total, message)
         * @returns {Object} { songs, setlists }
         */
        async sync(onProgress = () => {}) {
            onProgress(0, 4, 'Baixando músicas…');

            // 1. All songs with lyrics
            const { data: songs, error: songsErr } = await db()
                .from('songs')
                .select('*')
                .order('title', { ascending: true });
            if (songsErr) throw songsErr;

            onProgress(1, 4, 'Salvando músicas…');
            await idb().songs.saveAll(songs || []);

            onProgress(2, 4, 'Baixando setlists…');
            // 2. Setlists
            const { data: setlists, error: slErr } = await db()
                .from('setlists')
                .select('id, name')
                .order('name', { ascending: true });
            if (slErr) throw slErr;
            await idb().setlists.saveAll(setlists || []);

            onProgress(3, 4, 'Baixando relações de setlist…');
            // 3. Setlist–song links
            const { data: links, error: linksErr } = await db()
                .from('setlist_songs')
                .select('setlist_id, song_id, position');
            if (linksErr) throw linksErr;
            await idb().setlistSongs.saveAll(links || []);

            // 4. Save metadata
            const now = new Date().toISOString();
            await idb().meta.set('lastSync', now);
            await idb().meta.set('songCount', (songs || []).length);
            await idb().meta.set('setlistCount', (setlists || []).length);

            onProgress(4, 4, 'Concluído!');

            return {
                songs:    (songs    || []).length,
                setlists: (setlists || []).length,
            };
        },

        /**
         * Delta-sync of MP3 audio blobs.
         * Downloads only songs whose audio_url changed or was never cached.
         *
         * @param {Array}    songs       Array of song objects (from IndexedDB or state)
         * @param {Function} onProgress  callback(index, total, message, stats)
         * @returns {Object} { total, downloaded, skipped, errors }
         */
        async syncAudio(songs, onProgress = () => {}) {
            const withAudio = (songs || []).filter(s => s.audio_url);
            const total     = withAudio.length;

            if (total === 0) {
                onProgress(0, 0, 'Nenhuma música com áudio cadastrado.');
                return { total: 0, downloaded: 0, skipped: 0, errors: 0 };
            }

            let downloaded = 0;
            let skipped    = 0;
            let errors     = 0;

            for (let i = 0; i < withAudio.length; i++) {
                const song = withAudio[i];
                onProgress(i, total, song.title, { downloaded, skipped, errors });

                // ── Delta check ──────────────────────────────────────────
                // If we already have a blob and the URL didn't change → skip.
                let existing = null;
                try {
                    existing = await idb().audioBlobs.get(song.id);
                } catch (_) { /* IndexedDB read failure — treat as missing */ }

                if (existing && existing.audio_url === song.audio_url) {
                    skipped++;
                    continue;
                }

                // ── Download blob ────────────────────────────────────────
                try {
                    const response = await fetch(song.audio_url, { cache: 'no-store' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();

                    await idb().audioBlobs.put({
                        song_id:    song.id,
                        blob,
                        audio_url:  song.audio_url,
                        size_bytes: blob.size,
                        cached_at:  new Date().toISOString(),
                    });

                    downloaded++;
                } catch (err) {
                    console.warn(`[HMS] Audio sync failed for "${song.title}":`, err);
                    errors++;
                }
            }

            onProgress(total, total, 'Concluído!', { downloaded, skipped, errors });

            // Persist audio sync metadata
            await idb().meta.set('lastAudioSync',  new Date().toISOString());
            await idb().meta.set('audioCachedCount', downloaded + skipped);

            return { total, downloaded, skipped, errors };
        },

        // ── Metadata helpers ──────────────────────────────────────────

        /** Returns ISO string of last data sync, or null */
        async getLastSync() {
            return idb().meta.get('lastSync');
        },

        /** Returns ISO string of last audio sync, or null */
        async getLastAudioSync() {
            return idb().meta.get('lastAudioSync');
        },

        /** Returns { songCount, setlistCount } */
        async getStats() {
            const [songCount, setlistCount] = await Promise.all([
                idb().meta.get('songCount'),
                idb().meta.get('setlistCount'),
            ]);
            return { songCount: songCount || 0, setlistCount: setlistCount || 0 };
        },

        /** Returns { count, totalBytes } from audio_blobs store */
        async getAudioStats() {
            try {
                return await idb().audioBlobs.getStats();
            } catch (_) {
                return { count: 0, totalBytes: 0 };
            }
        },

        /** Human-readable last data sync label */
        async getLastSyncLabel() {
            const iso = await this.getLastSync();
            if (!iso) return 'Nunca sincronizado';
            return SyncManager._isoToLabel(iso);
        },

        /** Human-readable last audio sync label */
        async getLastAudioSyncLabel() {
            const iso = await this.getLastAudioSync();
            if (!iso) return 'Nunca sincronizado';
            return SyncManager._isoToLabel(iso);
        },

        _isoToLabel(iso) {
            const d = new Date(iso);
            const today = new Date();
            const isToday = d.toDateString() === today.toDateString();
            const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return isToday
                ? `hoje às ${time}`
                : d.toLocaleDateString('pt-BR') + ' às ' + time;
        },

        /** Clears the audio blob cache entirely */
        async clearAudioCache() {
            await idb().audioBlobs.clearAll();
            await idb().meta.set('lastAudioSync', null);
            await idb().meta.set('audioCachedCount', 0);
        },

        /** Returns human-readable file size string */
        formatBytes(bytes) {
            if (!bytes) return '0 B';
            if (bytes < 1024)         return `${bytes} B`;
            if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        },
    };

    window.HMSSyncManager = SyncManager;
    console.info('[HMS] SyncManager module loaded (v2 — audio sync).');
})();
