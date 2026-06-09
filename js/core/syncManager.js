/**
 * HMS — Sync Manager
 * Downloads all repertoire data from Supabase and persists it in IndexedDB.
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

        /** Returns ISO string of last sync, or null */
        async getLastSync() {
            return idb().meta.get('lastSync');
        },

        /** Returns { songCount, setlistCount } */
        async getStats() {
            const [songCount, setlistCount] = await Promise.all([
                idb().meta.get('songCount'),
                idb().meta.get('setlistCount'),
            ]);
            return { songCount: songCount || 0, setlistCount: setlistCount || 0 };
        },

        /** Human-readable last sync label */
        async getLastSyncLabel() {
            const iso = await this.getLastSync();
            if (!iso) return 'Nunca sincronizado';
            const d = new Date(iso);
            const today = new Date();
            const isToday = d.toDateString() === today.toDateString();
            const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            return isToday ? `hoje às ${time}` : d.toLocaleDateString('pt-BR') + ' às ' + time;
        },
    };

    window.HMSSyncManager = SyncManager;
    console.info('[HMS] SyncManager module loaded.');
})();
