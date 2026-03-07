/**
 * HMS — Repertoire Component (Dashboard)
 * Song list with search, setlist filters, and CRUD modal.
 * Exposed via window.RepertoireComponent
 */
(function () {
    'use strict';

    // Vagalume API key — register free at https://api.vagalume.com.br
    const VAGALUME_KEY = '';

    let _state = {
        songs:        [],
        setlists:     [],
        activeSetlist: '',
        searchQuery:  '',
    };

    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const KEYS = window.HarmonyEngine.allKeys();
    const keyLabel = v => { const k = KEYS.find(k => k.value === v); return k ? k.value : v; };

    const RepertoireComponent = {

        render: async function () {
            const content = document.getElementById('main-content');
            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-list-music"></i></div>
                        <div>
                            <h2>Repertório</h2>
                            <p>Sua biblioteca de músicas</p>
                        </div>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary" id="btn-manage-setlists">
                            <i class="fa-solid fa-folder-open"></i> Setlists
                        </button>
                        <button class="btn btn-primary" id="btn-new-song">
                            <i class="fa-solid fa-plus"></i> Nova Música
                        </button>
                    </div>
                </div>

                <!-- Setlist filter chips -->
                <div class="setlist-filter" id="setlist-chips">
                    <div class="content-loader" style="padding:8px 0;">
                        <div class="loader-spinner" style="width:18px;height:18px;border-width:2px;"></div>
                    </div>
                </div>

                <!-- Search bar -->
                <div class="search-bar mb-2">
                    <input type="text" id="song-search" class="form-input"
                        placeholder='Buscar por título, artista ou grau (ex: "25(4)")…'
                        value="${esc(_state.searchQuery)}" />
                    <button class="btn btn-secondary" id="btn-search">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </button>
                </div>

                <!-- Song list -->
                <div id="song-list">
                    <div class="content-loader">
                        <div class="loader-spinner"></div>
                        <p>Carregando músicas…</p>
                    </div>
                </div>
            `;

            document.getElementById('btn-new-song').addEventListener('click', () => {
                RepertoireComponent.openSongModal(null);
            });

            document.getElementById('btn-manage-setlists').addEventListener('click', () => {
                RepertoireComponent.openSetlistsModal();
            });

            document.getElementById('btn-search').addEventListener('click', () => {
                _state.searchQuery = document.getElementById('song-search').value.trim();
                RepertoireComponent._loadSongs();
            });

            document.getElementById('song-search').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    _state.searchQuery = e.target.value.trim();
                    RepertoireComponent._loadSongs();
                }
            });

            await Promise.all([
                RepertoireComponent._loadSetlists(),
                RepertoireComponent._loadSongs(),
            ]);
        },

        _loadSetlists: async function () {
            try {
                _state.setlists = await window.HMSAPI.Setlists.getAll();
                RepertoireComponent._renderSetlistChips();
            } catch (err) {
                console.warn('[Repertoire] setlists:', err.message);
            }
        },

        _renderSetlistChips: function () {
            const el = document.getElementById('setlist-chips');
            if (!el) return;
            const chips = [{ id: '', name: 'Todas' }, ..._state.setlists]
                .map(sl => `
                    <button class="setlist-chip ${_state.activeSetlist === sl.id ? 'active' : ''}"
                        data-setlist="${sl.id}">${esc(sl.name)}</button>
                `).join('');
            el.innerHTML = chips;
            el.querySelectorAll('.setlist-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    _state.activeSetlist = chip.dataset.setlist;
                    el.querySelectorAll('.setlist-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    RepertoireComponent._loadSongs();
                });
            });
        },

        _loadSongs: async function () {
            try {
                _state.songs = await window.HMSAPI.Songs.getAll({
                    search:    _state.searchQuery,
                    setlistId: _state.activeSetlist,
                });
                RepertoireComponent._renderSongList();
            } catch (err) {
                window.HMSApp.showToast('Erro ao carregar músicas: ' + err.message, 'error');
            }
        },

        _renderSongList: function () {
            const el = document.getElementById('song-list');
            if (!el) return;

            if (_state.songs.length === 0) {
                el.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-music"></i></div>
                        <h3>Nenhuma música encontrada</h3>
                        <p>Adicione sua primeira música ou ajuste os filtros.</p>
                    </div>`;
                return;
            }

            const cards = _state.songs.map(s => `
                <div class="song-card" data-id="${s.id}">
                    <div class="song-info">
                        <div class="song-title">${esc(s.title)}</div>
                        <div class="song-meta">
                            ${s.artist ? `<span><i class="fa-solid fa-microphone-stand fa-xs"></i> ${esc(s.artist)}</span>` : ''}
                            ${s.genre  ? `<span><i class="fa-solid fa-tag fa-xs"></i> ${esc(s.genre)}</span>` : ''}
                        </div>
                    </div>
                    <span class="song-key-badge">${esc(s.original_key)}</span>
                    <div class="song-actions">
                        <button class="btn-icon edit" data-action="play" data-id="${s.id}" title="Abrir no Player">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button class="btn-icon edit" data-action="edit" data-id="${s.id}" title="Editar">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-icon delete" data-action="delete" data-id="${s.id}" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">${cards}</div>`;

            el.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const { action, id } = btn.dataset;
                    if (action === 'play')   window.HMSApp.navigate('player', id);
                    if (action === 'edit')   RepertoireComponent.openSongModal(id);
                    if (action === 'delete') RepertoireComponent._handleDelete(id);
                });
            });
        },

        // ── Song Modal ────────────────────────────────────────────
        openSongModal: async function (songId) {
            let song = null;
            if (songId) {
                try {
                    window.HMSApp.showLoading();
                    song = await window.HMSAPI.Songs.getById(songId);
                } catch (err) {
                    window.HMSApp.showToast('Erro ao carregar música.', 'error');
                    return;
                } finally {
                    window.HMSApp.hideLoading();
                }
            }

            const isEdit = !!song;
            const keyOptions = KEYS.map(k =>
                `<option value="${k.value}" ${song && song.original_key === k.value ? 'selected' : ''}>${k.label}</option>`
            ).join('');

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3>
                        <i class="fa-solid fa-${isEdit ? 'pen-to-square' : 'music'}"></i>
                        ${isEdit ? 'Editar Música' : 'Nova Música'}
                    </h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <form id="song-form" novalidate>
                        <div class="form-grid">
                            <div class="form-group form-group-full">
                                <label class="form-label">Título *</label>
                                <input type="text" id="sf-title" class="form-input"
                                    placeholder="Nome da música"
                                    value="${esc(song?.title || '')}" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">Intérprete</label>
                                <input type="text" id="sf-artist" class="form-input"
                                    placeholder="Artista / Banda"
                                    value="${esc(song?.artist || '')}" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">Compositor</label>
                                <input type="text" id="sf-composer" class="form-input"
                                    placeholder="Compositor"
                                    value="${esc(song?.composer || '')}" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">Gênero</label>
                                <input type="text" id="sf-genre" class="form-input"
                                    placeholder="Samba, MPB, Gospel…"
                                    value="${esc(song?.genre || '')}" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">Tom Original *</label>
                                <select id="sf-key" class="form-input form-select">
                                    ${keyOptions}
                                </select>
                            </div>
                            <div class="form-group form-group-full">
                                <label class="form-label">Harmonia em Graus *</label>
                                <textarea id="sf-harmony" class="form-input" rows="3"
                                    placeholder="Ex: 1 - 6m - 25(4) - 4 - 57 - 1">${esc(song?.harmony_str || '')}</textarea>
                                <span class="form-hint">Use a sintaxe HMS: 1 6m 25(4) !2M! {1 4}x2</span>
                            </div>
                            <div class="form-group form-group-full">
                                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                                    <label class="form-label" style="margin:0;">Letra</label>
                                    <button type="button" class="btn btn-secondary btn-sm" id="btn-fetch-lyrics">
                                        <i class="fa-solid fa-magnifying-glass"></i> Buscar na web
                                    </button>
                                </div>
                                <textarea id="sf-lyrics" class="form-input" rows="4"
                                    placeholder="Letra da música (opcional)">${esc(song?.lyrics || '')}</textarea>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
                    <button class="btn btn-primary" id="modal-save-btn">
                        <i class="fa-solid fa-floppy-disk"></i>
                        ${isEdit ? 'Salvar Alterações' : 'Adicionar'}
                    </button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-save-btn').addEventListener('click', () => {
                RepertoireComponent._handleSaveSong(songId);
            });
            document.getElementById('btn-fetch-lyrics').addEventListener('click', () => {
                RepertoireComponent._fetchLyrics();
            });

            document.getElementById('sf-title').focus();
        },

        _fetchLyrics: async function () {
            const artist = (document.getElementById('sf-artist').value || '').trim();
            const title  = (document.getElementById('sf-title').value  || '').trim();

            if (!artist || !title) {
                window.HMSApp.showToast('Preencha Título e Intérprete antes de buscar.', 'warning');
                return;
            }

            const btn = document.getElementById('btn-fetch-lyrics');
            const setStatus = (msg) => { btn.innerHTML = `<span class="btn-spinner"></span> ${msg}`; };
            btn.disabled = true;

            try {
                // 1. Try lrclib.net
                setStatus('lrclib…');
                let lyrics = null;
                try {
                    const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
                    if (res.ok) {
                        const data = await res.json();
                        lyrics = data.plainLyrics || data.syncedLyrics || null;
                    }
                } catch { /* network error, continue */ }

                if (lyrics) {
                    document.getElementById('sf-lyrics').value = lyrics.trim();
                    window.HMSApp.showToast('Letra encontrada via lrclib.net!', 'success');
                    return;
                }

                // 2. Try Vagalume
                if (!VAGALUME_KEY) {
                    window.HMSApp.showToast('lrclib: não encontrado. Configure VAGALUME_KEY para tentar Vagalume.', 'warning');
                    return;
                }
                setStatus('Vagalume…');
                try {
                    const res = await fetch(`https://api.vagalume.com.br/search.php?art=${encodeURIComponent(artist)}&mus=${encodeURIComponent(title)}&apikey=${VAGALUME_KEY}`);
                    if (res.ok) {
                        const data = await res.json();
                        lyrics = data.mus?.[0]?.text || null;
                    }
                } catch { /* network error */ }

                if (lyrics) {
                    document.getElementById('sf-lyrics').value = lyrics.trim();
                    window.HMSApp.showToast('Letra encontrada via Vagalume!', 'success');
                } else {
                    window.HMSApp.showToast('lrclib: ✗  Vagalume: ✗  Letra não encontrada.', 'warning');
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar na web';
            }
        },

        _handleSaveSong: async function (editId) {
            const title      = (document.getElementById('sf-title').value || '').trim();
            const artist     = (document.getElementById('sf-artist').value || '').trim();
            const composer   = (document.getElementById('sf-composer').value || '').trim();
            const genre      = (document.getElementById('sf-genre').value || '').trim();
            const originalKey = document.getElementById('sf-key').value;
            const harmonyStr = (document.getElementById('sf-harmony').value || '').trim();
            const lyrics     = (document.getElementById('sf-lyrics').value || '').trim();

            if (!title) {
                window.HMSApp.showToast('Informe o título da música.', 'warning');
                document.getElementById('sf-title').focus();
                return;
            }
            if (!harmonyStr) {
                window.HMSApp.showToast('Informe a harmonia em graus.', 'warning');
                document.getElementById('sf-harmony').focus();
                return;
            }

            const saveBtn = document.getElementById('modal-save-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="btn-spinner"></span> Salvando…';

            const payload = {
                title, artist: artist || null, composer: composer || null,
                genre: genre || null, original_key: originalKey,
                harmony_str: harmonyStr, lyrics: lyrics || null,
            };

            try {
                if (editId) {
                    await window.HMSAPI.Songs.update(editId, payload);
                    window.HMSApp.showToast('Música atualizada!', 'success');
                } else {
                    await window.HMSAPI.Songs.create(payload);
                    window.HMSApp.showToast('Música adicionada!', 'success');
                }
                window.HMSApp.closeModal();
                await RepertoireComponent._loadSongs();
            } catch (err) {
                window.HMSApp.showToast('Erro ao salvar: ' + err.message, 'error');
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${editId ? 'Salvar Alterações' : 'Adicionar'}`;
            }
        },

        _handleDelete: async function (id) {
            const song = _state.songs.find(s => s.id === id);
            if (!song) return;
            if (!confirm(`Excluir "${song.title}"? Esta ação não pode ser desfeita.`)) return;
            try {
                window.HMSApp.showLoading();
                await window.HMSAPI.Songs.delete(id);
                window.HMSApp.showToast('Música removida.', 'success');
                await RepertoireComponent._loadSongs();
            } catch (err) {
                window.HMSApp.showToast('Erro ao excluir: ' + err.message, 'error');
            } finally {
                window.HMSApp.hideLoading();
            }
        },

        // ── Setlists Management Modal ─────────────────────────────
        openSetlistsModal: function () {
            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-folder-open"></i> Gerenciar Setlists</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div style="display:flex;gap:8px;margin-bottom:16px;">
                        <input type="text" id="new-setlist-name" class="form-input"
                            placeholder="Nome da nova setlist" />
                        <button class="btn btn-primary btn-sm" id="btn-add-setlist">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div id="setlist-list">
                        ${RepertoireComponent._renderSetlistItems()}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            document.getElementById('btn-add-setlist').addEventListener('click', async () => {
                const name = document.getElementById('new-setlist-name').value.trim();
                if (!name) return;
                try {
                    await window.HMSAPI.Setlists.create(name);
                    await RepertoireComponent._loadSetlists();
                    document.getElementById('new-setlist-name').value = '';
                    document.getElementById('setlist-list').innerHTML = RepertoireComponent._renderSetlistItems();
                    RepertoireComponent._bindSetlistDeleteButtons();
                } catch (err) {
                    window.HMSApp.showToast('Erro: ' + err.message, 'error');
                }
            });

            RepertoireComponent._bindSetlistDeleteButtons();
        },

        _renderSetlistItems: function () {
            if (_state.setlists.length === 0) return '<p style="color:var(--text-muted);font-size:.875rem;">Nenhuma setlist criada ainda.</p>';
            return _state.setlists.map(sl => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--glass-border);">
                    <span style="font-size:.9rem;">${esc(sl.name)}</span>
                    <button class="btn-icon delete sl-delete-btn" data-id="${sl.id}" title="Excluir setlist">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('');
        },

        _bindSetlistDeleteButtons: function () {
            document.querySelectorAll('.sl-delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const sl = _state.setlists.find(s => s.id === btn.dataset.id);
                    if (!sl || !confirm(`Excluir setlist "${sl.name}"?`)) return;
                    try {
                        await window.HMSAPI.Setlists.delete(sl.id);
                        await RepertoireComponent._loadSetlists();
                        document.getElementById('setlist-list').innerHTML = RepertoireComponent._renderSetlistItems();
                        RepertoireComponent._bindSetlistDeleteButtons();
                    } catch (err) {
                        window.HMSApp.showToast('Erro: ' + err.message, 'error');
                    }
                });
            });
        },
    };

    window.RepertoireComponent = RepertoireComponent;
    console.info('[HMS] RepertoireComponent loaded.');
})();
