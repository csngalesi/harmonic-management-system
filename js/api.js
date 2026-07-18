/**
 * HMS — API Module
 * All Supabase database queries. Exposed via window.HMSAPI.
 */
(function () {
    'use strict';

    const db = () => window.supabaseClient;

    // ── Offline guard for write operations ───────────────────────
    function requireOnline(op) {
        if (window.HMSOffline && window.HMSOffline.isOffline()) {
            throw new Error(`Sem conexão — "${op}" indisponível offline`);
        }
    }

    // ── Songs ────────────────────────────────────────────────────
    const Songs = {
        async getAll({ search = '', setlistId = '', searchType = 'all' } = {}) {
            // ── Offline: read from IndexedDB ──────────────────────
            if (window.HMSOffline && window.HMSOffline.isOffline()) {
                let songs = await window.HMSOfflineDB.songs.getAll();

                // Filter by setlist
                if (setlistId) {
                    const links = await window.HMSOfflineDB.setlistSongs.getBySetlist(setlistId);
                    if (links.length === 0) return [];
                    const posMap = {};
                    links.forEach(l => { posMap[l.song_id] = l.position; });
                    songs = songs
                        .filter(s => posMap[s.id] !== undefined)
                        .map(s => ({ ...s, _position: posMap[s.id] ?? null }));
                }

                // Filter by search
                if (search) {
                    const q = search.toLowerCase();
                    songs = songs.filter(s => {
                        switch (searchType) {
                            case 'title':   return (s.title       || '').toLowerCase().includes(q);
                            case 'artist':  return (s.artist      || '').toLowerCase().includes(q);
                            case 'genre':   return (s.genre       || '').toLowerCase().includes(q);
                            case 'harmony': return (s.harmony_str || '').toLowerCase().includes(q);
                            default: // 'all'
                                return (s.title + s.artist + s.genre + s.harmony_str)
                                    .toLowerCase().includes(q);
                        }
                    });
                }

                return songs;
            }

            // ── Online: Supabase ──────────────────────────────────
            let query = db()
                .from('songs')
                .select('id, title, artist, composer, genre, original_key, harmony_str, has_lyrics, is_alert, status_flag, audio_url, created_at')
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
            if (window.HMSOffline && window.HMSOffline.isOffline()) {
                const song = await window.HMSOfflineDB.songs.getById(id);
                if (!song) throw new Error('Música não encontrada no cache offline');
                return song;
            }
            const { data, error } = await db()
                .from('songs')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },

        async create(payload) {
            requireOnline('criar música');
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
            requireOnline('editar música');
            const { data, error } = await db()
                .from('songs')
                .update(payload)
                .eq('id', id)
                .select('id');
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('Sem permissão para editar esta música. Contate o administrador.');
            }
        },

        async delete(id) {
            requireOnline('excluir música');
            const { error } = await db()
                .from('songs')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },

        async bulkCreate(rows) {
            requireOnline('importar músicas');
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
            if (window.HMSOffline && window.HMSOffline.isOffline()) {
                return window.HMSOfflineDB.setlists.getAll();
            }
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

        // UPDATE only — avoids RLS INSERT policy when song is already in setlist
        async updateSongPosition(setlistId, songId, position) {
            const { data, error } = await db()
                .from('setlist_songs')
                .update({ position })
                .eq('setlist_id', setlistId)
                .eq('song_id', songId)
                .select('song_id, position');
            if (error) throw error;
            // data = array of updated rows; length 0 means no row matched (silent fail)
            return data || [];
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

    // ── Cadence Phrases ──────────────────────────────────────────
    const CadencePhrases = {
        async getAll() {
            const { data, error } = await db()
                .from('cadence_phrases')
                .select('id, user_id, title, description, harmony, root, is_minor, bpm, created_at')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async create(payload) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('cadence_phrases')
                .insert({ ...payload, user_id: user.id })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(id, payload) {
            const { data, error } = await db()
                .from('cadence_phrases')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(id) {
            const { error } = await db()
                .from('cadence_phrases')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
    };

    // ── Melodic Phrases ──────────────────────────────────────────
    const MelodicPhrases = {
        async getAll() {
            const { data, error } = await db()
                .from('melodic_phrases')
                .select('id, user_id, title, description, melody, root, scale_key, bpm, created_at')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async create(payload) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('melodic_phrases')
                .insert({ ...payload, user_id: user.id })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(id, payload) {
            const { data, error } = await db()
                .from('melodic_phrases')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(id) {
            const { error } = await db()
                .from('melodic_phrases')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
    };

    // ── Harmonic Melodic Studies ─────────────────────────────────
    const HarmonicStudies = {
        async getAll() {
            const { data, error } = await db()
                .from('harmonic_melodic_studies')
                .select('id, user_id, title, root, is_minor, harmony, bpm, note_dur, slots, created_at')
                .neq('note_dur', 'bass')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async create(payload) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('harmonic_melodic_studies')
                .insert({ ...payload, user_id: user.id })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(id) {
            const { error } = await db()
                .from('harmonic_melodic_studies')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
    };

    const BassStudies = {
        async getAll() {
            const { data, error } = await db()
                .from('harmonic_melodic_studies')
                .select('id, user_id, title, root, is_minor, harmony, bpm, note_dur, slots, created_at')
                .eq('note_dur', 'bass')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        async create(payload) {
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('harmonic_melodic_studies')
                .insert({ ...payload, user_id: user.id })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async delete(id) {
            const { error } = await db()
                .from('harmonic_melodic_studies')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        async update(id, payload) {
            const { error } = await db()
                .from('harmonic_melodic_studies')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
        },
    };

    // ── Guitar Samples ───────────────────────────────────────────
    const GUITAR_BUCKET = 'guitar-samples';

    const GuitarSamples = {
        /** Retorna todos os samples do usuário logado */
        async getAll() {
            const { data, error } = await db()
                .from('guitar_samples')
                .select('id, chord_root, chord_quality, instrument, storage_path, duration_ms, created_at')
                .order('instrument', { ascending: true })
                .order('chord_root',    { ascending: true })
                .order('chord_quality', { ascending: true });
            if (error) throw error;
            return data || [];
        },

        /** Retorna URL pública de um storage_path */
        getPublicUrl(storagePath) {
            const { data } = db().storage.from(GUITAR_BUCKET).getPublicUrl(storagePath);
            return data?.publicUrl || null;
        },

        /**
         * Faz upload do WAV blob para o bucket e atualiza/insere a linha na tabela.
         * @param {Blob}   blob         - WAV mono PCM16
         * @param {string} chordRoot    - 'C', 'D', ...
         * @param {string} chordQuality - '', 'm', '7', 'm7', 'dim'
         * @param {string} instrument   - 'guitar' | 'cavaco'
         * @param {number} durationMs   - duração em ms após processamento
         */
        async upload(blob, chordRoot, chordQuality, instrument, durationMs) {
            requireOnline('gravar sample');
            const user = await window.HMSAuth.currentUser();
            const qualityKey = chordQuality === '' ? 'maj' : chordQuality;
            const storagePath = `${user.id}/${instrument}/${chordRoot}${qualityKey}.wav`;

            // Upload para o bucket (upsert=true sobrescreve sample anterior)
            const { error: upErr } = await db()
                .storage
                .from(GUITAR_BUCKET)
                .upload(storagePath, blob, {
                    contentType: 'audio/wav',
                    upsert: true,
                });
            if (upErr) throw upErr;

            // Upsert da linha na tabela
            return GuitarSamples.upsert(chordRoot, chordQuality, instrument, storagePath, durationMs);
        },

        /**
         * Atualiza ou insere metadados de um sample (sem re-upload do arquivo).
         */
        async upsert(chordRoot, chordQuality, instrument, storagePath, durationMs) {
            requireOnline('salvar sample');
            const user = await window.HMSAuth.currentUser();
            const { data, error } = await db()
                .from('guitar_samples')
                .upsert(
                    {
                        user_id:       user.id,
                        chord_root:    chordRoot,
                        chord_quality: chordQuality,
                        instrument,
                        storage_path:  storagePath,
                        duration_ms:   durationMs || null,
                    },
                    { onConflict: 'user_id,chord_root,chord_quality,instrument' }
                )
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        /**
         * Remove sample do storage e da tabela.
         */
        async remove(chordRoot, chordQuality, instrument) {
            requireOnline('deletar sample');
            const user = await window.HMSAuth.currentUser();
            const qualityKey = chordQuality === '' ? 'maj' : chordQuality;
            const storagePath = `${user.id}/${instrument}/${chordRoot}${qualityKey}.wav`;

            // Deletar do storage
            const { error: stErr } = await db()
                .storage
                .from(GUITAR_BUCKET)
                .remove([storagePath]);
            if (stErr) console.warn('[GuitarSamples] storage remove warning:', stErr.message);

            // Deletar da tabela
            const { error: dbErr } = await db()
                .from('guitar_samples')
                .delete()
                .eq('chord_root',    chordRoot)
                .eq('chord_quality', chordQuality)
                .eq('instrument',    instrument)
                .eq('user_id',       user.id);
            if (dbErr) throw dbErr;
        },
    };

    window.HMSAPI = { Songs, Setlists, Profile, MelodicPhrases, HarmonicStudies, BassStudies, CadencePhrases, GuitarSamples };

    console.info('[HMS] API module loaded.');
})();
