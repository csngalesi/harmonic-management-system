/**
 * HMS — API Module
 * All Supabase database queries. Exposed via window.HMSAPI.
 */
(function () {
    'use strict';

    const db = () => window.supabaseClient;

    // ── Songs ────────────────────────────────────────────────────
    const Songs = {
        async getAll({ search = '', setlistId = '', searchType = 'all' } = {}) {
            let query = db()
                .from('songs')
                .select('id, title, artist, composer, genre, original_key, harmony_str, has_lyrics, created_at')
                .order('title', { ascending: true });

            if (search) {
                switch (searchType) {
                    case 'title':   query = query.ilike('title',       `%${search}%`); break;
                    case 'artist':  query = query.ilike('artist',      `%${search}%`); break;
                    case 'genre':   query = query.ilike('genre',       `%${search}%`); break;
                    case 'harmony': query = query.ilike('harmony_str', `%${search}%`); break;
                    default: // 'all'
                        query = query.or(`title.ilike.%${search}%,artist.ilike.%${search}%,genre.ilike.%${search}%,harmony_str.ilike.%${search}%`);
                }
            }

            if (setlistId) {
                const { data: links } = await db()
                    .from('setlist_songs')
                    .select('song_id, position')
                    .eq('setlist_id', setlistId);
                const links_ = links || [];
                if (links_.length === 0) return [];
                const ids = links_.map(l => l.song_id);
                const posMap = {};
                links_.forEach(l => { posMap[l.song_id] = l.position; });
                const { data, error } = await query.in('id', ids);
                if (error) throw error;
                return (data || []).map(s => ({ ...s, _position: posMap[s.id] ?? null }));
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },

        async getById(id) {
            const { data, error } = await db()
                .from('songs')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },

        async create(payload) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('songs')
                .insert({ ...payload, user_id: user.id })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(id, payload) {
            const { data, error } = await db()
                .from('songs')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(id) {
            const { error } = await db()
                .from('songs')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },

        async bulkCreate(rows) {
            const user = await window.HMSAuth.currentUser();
            const payload = rows.map(r => ({ ...r, user_id: user.id }));
            const { data, error } = await db()
                .from('songs')
                .insert(payload)
                .select('id, title, artist');
            if (error) throw error;
            return data || [];
        },
    };

    // ── Setlists ─────────────────────────────────────────────────
    const Setlists = {
        async getAll() {
            const { data, error } = await db()
                .from('setlists')
                .select('id, name')
                .order('name', { ascending: true });
            if (error) throw error;
            return data || [];
        },

        async create(name) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('setlists')
                .insert({ name, user_id: user.id })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async rename(id, name) {
            const { data, error } = await db()
                .from('setlists')
                .update({ name })
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(id) {
            const { error } = await db().from('setlists').delete().eq('id', id);
            if (error) throw error;
        },

        async addSong(setlistId, songId, position = 0) {
            const { error } = await db()
                .from('setlist_songs')
                .upsert(
                    { setlist_id: setlistId, song_id: songId, position },
                    { onConflict: 'setlist_id,song_id' }
                );
            if (error) throw error;
        },

        async removeSong(setlistId, songId) {
            const { error } = await db()
                .from('setlist_songs')
                .delete()
                .eq('setlist_id', setlistId)
                .eq('song_id', songId);
            if (error) throw error;
        },
    };

    // ── Profile ──────────────────────────────────────────────────
    const Profile = {
        async get() {
            const user = await window.HMSAuth.currentUser();
            if (!user) return null;
            const { data, error } = await db()
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error) throw error;
            return data;
        },

        async update(payload) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('profiles')
                .update(payload)
                .eq('id', user.id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
    };

    window.HMSAPI = { Songs, Setlists, Profile };

    console.info('[HMS] API module loaded.');
})();
