/**
 * HMS — API Module
 * All Supabase database queries. Exposed via window.HMSAPI.
 */
(function () {
    'use strict';

    const db = () => window.supabaseClient;

    // ── Songs ────────────────────────────────────────────────────
    const Songs = {
        async getAll({ search = '', setlistId = '' } = {}) {
            let query = db()
                .from('songs')
                .select('id, title, artist, composer, genre, original_key, harmony_str, created_at')
                .order('title', { ascending: true });

            if (search) {
                query = query.or(`title.ilike.%${search}%,artist.ilike.%${search}%,harmony_str.ilike.%${search}%`);
            }

            if (setlistId) {
                const { data: links } = await db()
                    .from('setlist_songs')
                    .select('song_id')
                    .eq('setlist_id', setlistId);
                const ids = (links || []).map(l => l.song_id);
                if (ids.length === 0) return [];
                query = query.in('id', ids);
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

        async addSong(setlistId, songId) {
            const { error } = await db()
                .from('setlist_songs')
                .insert({ setlist_id: setlistId, song_id: songId });
            if (error && error.code !== '23505') throw error; // 23505 = unique violation
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
