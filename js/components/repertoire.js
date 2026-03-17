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
        searchType:   'all',      // 'all' | 'title' | 'artist' | 'genre' | 'harmony'
        sortBy:       'title',    // 'title' | 'artist' | 'key' | 'position'
        sortDir:      'asc',      // 'asc' | 'desc'
        viewMode:        'list',     // 'list' | 'show'
        headerCollapsed: false,
        // Client-side filters (null = sem filtro)
        filterFlag:  null,   // null | 0 | 1 | 2 | 3
        filterHarm:  null,   // null | true | false
        filterLetra: null,   // null | true | false
        filterLink:  null,   // null | true | false
    };

    // Drag state for position reordering
    let _dragSongId = null;

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
                            <p ${_state.headerCollapsed ? 'style="display:none"' : ''}>Sua biblioteca de músicas</p>
                        </div>
                        <button class="btn-icon" id="btn-collapse-header" title="${_state.headerCollapsed ? 'Expandir controles' : 'Minimizar controles'}" style="margin-left:8px;">
                            <i class="fa-solid fa-chevron-${_state.headerCollapsed ? 'down' : 'up'}"></i>
                        </button>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-secondary${_state.viewMode === 'show' ? ' active' : ''}" id="btn-toggle-show" title="Modo Show — grid condensado">
                            <i class="fa-solid fa-table-cells"></i> Show
                        </button>
                        <button class="btn btn-secondary" id="btn-manage-setlists">
                            <i class="fa-solid fa-folder-open"></i> Setlists
                        </button>
                        <label class="btn btn-secondary" id="label-import-csv" style="cursor:pointer;" title="Importar lista CSV (Título;Artista)">
                            <i class="fa-solid fa-file-import"></i> Importar CSV
                            <input type="file" id="input-import-csv" accept=".csv,.txt" style="display:none;" />
                        </label>
                        <button class="btn btn-secondary" id="btn-bulk-lyrics" title="Buscar letras em massa via lrclib.net">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Buscar Letras
                        </button>
                        <button class="btn btn-secondary" id="btn-bulk-hygiene" title="Higienizar harmonias — detecta texto livre e envolve em $...$">
                            <i class="fa-solid fa-broom"></i> Higienizar
                        </button>
                        <button class="btn btn-primary" id="btn-new-song">
                            <i class="fa-solid fa-plus"></i> Nova Música
                        </button>
                    </div>
                </div>

                <!-- Collapsible controls -->
                <div id="rep-controls" ${_state.headerCollapsed ? 'style="display:none"' : ''}>

                <!-- Setlist filter chips -->
                <div class="setlist-filter" id="setlist-chips">
                    <div class="content-loader" style="padding:8px 0;">
                        <div class="loader-spinner" style="width:18px;height:18px;border-width:2px;"></div>
                    </div>
                </div>

                <!-- Search block: type pills + input -->
                <div class="search-block mb-2">
                    <div class="search-type-bar" id="search-type-bar">
                        <button class="search-type-pill ${_state.searchType === 'all'     ? 'active' : ''}" data-type="all">Tudo</button>
                        <button class="search-type-pill ${_state.searchType === 'title'   ? 'active' : ''}" data-type="title">Título</button>
                        <button class="search-type-pill ${_state.searchType === 'artist'  ? 'active' : ''}" data-type="artist">Artista</button>
                        <button class="search-type-pill ${_state.searchType === 'genre'   ? 'active' : ''}" data-type="genre">Gênero</button>
                        <button class="search-type-pill ${_state.searchType === 'harmony' ? 'active' : ''}" data-type="harmony">Harmonia</button>
                    </div>
                    <div class="search-bar">
                        <input type="text" id="song-search" class="form-input"
                            placeholder="Buscar…"
                            value="${esc(_state.searchQuery)}" />
                        <button class="btn btn-icon" id="btn-search-clear"
                            title="Limpar busca"
                            style="${_state.searchQuery ? '' : 'display:none'}">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                        <button class="btn btn-secondary" id="btn-search">
                            <i class="fa-solid fa-magnifying-glass"></i>
                        </button>
                    </div>
                </div>

                <!-- Filter bar -->
                <div class="filter-bar mb-2" id="filter-bar">
                    <span class="filter-label">Flag:</span>
                    <button class="filter-pill${_state.filterFlag === null ? ' active' : ''}" data-filter="flag" data-val="null" title="Todas">·</button>
                    <button class="filter-pill sf-1${_state.filterFlag === 1 ? ' active' : ''}" data-filter="flag" data-val="1" title="Verde"><i class="fa-solid fa-flag"></i></button>
                    <button class="filter-pill sf-2${_state.filterFlag === 2 ? ' active' : ''}" data-filter="flag" data-val="2" title="Amarela"><i class="fa-solid fa-flag"></i></button>
                    <button class="filter-pill sf-3${_state.filterFlag === 3 ? ' active' : ''}" data-filter="flag" data-val="3" title="Vermelha"><i class="fa-solid fa-flag"></i></button>
                    <button class="filter-pill${_state.filterFlag === 0 ? ' active' : ''}" data-filter="flag" data-val="0" title="Sem bandeira"><i class="fa-solid fa-flag" style="opacity:.25;"></i></button>
                    <span class="filter-sep">|</span>
                    <span class="filter-label">Harm:</span>
                    <button class="filter-pill${_state.filterHarm === null  ? ' active' : ''}" data-filter="harm" data-val="null">·</button>
                    <button class="filter-pill${_state.filterHarm === true  ? ' active' : ''}" data-filter="harm" data-val="true">S</button>
                    <button class="filter-pill${_state.filterHarm === false ? ' active' : ''}" data-filter="harm" data-val="false">N</button>
                    <span class="filter-sep">|</span>
                    <span class="filter-label">Letra:</span>
                    <button class="filter-pill${_state.filterLetra === null  ? ' active' : ''}" data-filter="letra" data-val="null">·</button>
                    <button class="filter-pill${_state.filterLetra === true  ? ' active' : ''}" data-filter="letra" data-val="true">S</button>
                    <button class="filter-pill${_state.filterLetra === false ? ' active' : ''}" data-filter="letra" data-val="false">N</button>
                    <span class="filter-sep">|</span>
                    <span class="filter-label">Link:</span>
                    <button class="filter-pill${_state.filterLink === null  ? ' active' : ''}" data-filter="link" data-val="null">·</button>
                    <button class="filter-pill${_state.filterLink === true  ? ' active' : ''}" data-filter="link" data-val="true">S</button>
                    <button class="filter-pill${_state.filterLink === false ? ' active' : ''}" data-filter="link" data-val="false">N</button>
                </div>

                <!-- Sort toolbar -->
                <div class="sort-toolbar mb-2" id="sort-toolbar">
                    <span class="sort-label">Ordenar:</span>
                    ${[
                        { field: 'title',    label: 'Título'  },
                        { field: 'artist',   label: 'Artista' },
                        { field: 'key',      label: 'Tom'     },
                        { field: 'position', label: 'Posição' },
                    ].map(({ field, label }) => {
                        const isActive   = _state.sortBy === field;
                        const isDisabled = field === 'position' && !_state.activeSetlist;
                        const icon = isActive
                            ? (field === 'position'
                                ? `<i class="fa-solid fa-arrow-${_state.sortDir === 'asc' ? 'up' : 'down'}-1-9"></i>`
                                : `<i class="fa-solid fa-arrow-${_state.sortDir === 'asc' ? 'up' : 'down'}-a-z"></i>`)
                            : '';
                        return `<button class="sort-btn${isActive ? ' active' : ''}${isDisabled ? ' disabled' : ''}" data-sort="${field}"${isDisabled ? ' disabled' : ''}>${label} ${icon}</button>`;
                    }).join('')}
                </div>

                </div><!-- /rep-controls -->

                <!-- Song list -->
                <div id="song-list">
                    <div class="content-loader">
                        <div class="loader-spinner"></div>
                        <p>Carregando músicas…</p>
                    </div>
                </div>
            `;

            document.getElementById('btn-collapse-header').addEventListener('click', () => {
                _state.headerCollapsed = !_state.headerCollapsed;
                const controls = document.getElementById('rep-controls');
                const btn      = document.getElementById('btn-collapse-header');
                const sub      = document.querySelector('.page-title p');
                controls.style.display = _state.headerCollapsed ? 'none' : '';
                if (sub) sub.style.display = _state.headerCollapsed ? 'none' : '';
                btn.querySelector('i').className = `fa-solid fa-chevron-${_state.headerCollapsed ? 'down' : 'up'}`;
                btn.title = _state.headerCollapsed ? 'Expandir controles' : 'Minimizar controles';
            });

            document.getElementById('btn-toggle-show').addEventListener('click', () => {
                _state.viewMode = _state.viewMode === 'show' ? 'list' : 'show';
                document.getElementById('btn-toggle-show').classList.toggle('active', _state.viewMode === 'show');
                RepertoireComponent._renderSongList();
            });

            document.getElementById('btn-new-song').addEventListener('click', () => {
                RepertoireComponent.openSongModal(null);
            });

            document.getElementById('btn-manage-setlists').addEventListener('click', () => {
                RepertoireComponent.openSetlistsModal();
            });

            document.getElementById('input-import-csv').addEventListener('change', (e) => {
                if (e.target.files[0]) RepertoireComponent._importCSV(e.target.files[0]);
                e.target.value = '';
            });

            document.getElementById('btn-bulk-lyrics').addEventListener('click', () => {
                RepertoireComponent._bulkFetchLyrics();
            });

            document.getElementById('btn-bulk-hygiene').addEventListener('click', () => {
                RepertoireComponent._bulkHygienize();
            });


            document.getElementById('btn-search-clear').addEventListener('click', () => {
                _state.searchQuery = '';
                document.getElementById('song-search').value = '';
                document.getElementById('btn-search-clear').style.display = 'none';
                RepertoireComponent._loadSongs();
            });

            document.getElementById('song-search').addEventListener('input', (e) => {
                const clearBtn = document.getElementById('btn-search-clear');
                if (clearBtn) clearBtn.style.display = e.target.value ? '' : 'none';
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

            // Search type pills
            document.getElementById('search-type-bar').addEventListener('click', (e) => {
                const pill = e.target.closest('.search-type-pill');
                if (!pill) return;
                _state.searchType = pill.dataset.type;
                document.querySelectorAll('.search-type-pill')
                    .forEach(p => p.classList.toggle('active', p.dataset.type === _state.searchType));
                if (_state.searchQuery) RepertoireComponent._loadSongs();
            });

            // Filter bar
            document.getElementById('filter-bar').addEventListener('click', (e) => {
                const pill = e.target.closest('.filter-pill');
                if (!pill) return;
                const filter = pill.dataset.filter;
                const raw    = pill.dataset.val;
                const val    = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : parseInt(raw, 10);
                if (filter === 'flag')  _state.filterFlag  = val;
                if (filter === 'harm')  _state.filterHarm  = val;
                if (filter === 'letra') _state.filterLetra = val;
                if (filter === 'link')  _state.filterLink  = val;
                RepertoireComponent._renderFilterBar();
                RepertoireComponent._renderSongList();
            });

            // Sort buttons
            document.getElementById('sort-toolbar').addEventListener('click', (e) => {
                const btn = e.target.closest('.sort-btn');
                if (!btn || btn.disabled) return;
                const field = btn.dataset.sort;
                if (_state.sortBy === field) {
                    _state.sortDir = _state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    _state.sortBy  = field;
                    _state.sortDir = 'asc';
                }
                RepertoireComponent._renderSortToolbar();
                RepertoireComponent._renderSongList();
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
            const manageBtn = _state.activeSetlist
                ? `<button class="btn btn-secondary btn-sm" id="btn-manage-songs" style="margin-left:8px;flex-shrink:0;">
                       <i class="fa-solid fa-list-check"></i> Gerenciar Músicas
                   </button>`
                : '';
            el.innerHTML = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">${chips}${manageBtn}</div>`;
            el.querySelectorAll('.setlist-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    _state.activeSetlist = chip.dataset.setlist;
                    // Position sort is invalid without an active setlist — fall back to title
                    if (!_state.activeSetlist && _state.sortBy === 'position') {
                        _state.sortBy  = 'title';
                        _state.sortDir = 'asc';
                    }
                    el.querySelectorAll('.setlist-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    RepertoireComponent._renderSetlistChips();
                    RepertoireComponent._loadSongs();
                });
            });
            const manageSongsBtn = document.getElementById('btn-manage-songs');
            if (manageSongsBtn) {
                manageSongsBtn.addEventListener('click', () => {
                    RepertoireComponent._openSetlistSongManager();
                });
            }
        },

        _loadSongs: async function () {
            try {
                _state.songs = await window.HMSAPI.Songs.getAll({
                    search:     _state.searchQuery,
                    setlistId:  _state.activeSetlist,
                    searchType: _state.searchType,
                });
                RepertoireComponent._renderSortToolbar();
                RepertoireComponent._renderSongList();
            } catch (err) {
                window.HMSApp.showToast('Erro ao carregar músicas: ' + err.message, 'error');
            }
        },

        _renderFilterBar: function () {
            const bar = document.getElementById('filter-bar');
            if (!bar) return;
            bar.querySelectorAll('.filter-pill[data-filter]').forEach(pill => {
                const filter = pill.dataset.filter;
                const raw    = pill.dataset.val;
                const val    = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : parseInt(raw, 10);
                const cur = _state['filter' + filter.charAt(0).toUpperCase() + filter.slice(1)];
                pill.classList.toggle('active', cur === val);
            });
        },

        _renderSortToolbar: function () {
            const toolbar = document.getElementById('sort-toolbar');
            if (!toolbar) return;
            toolbar.querySelectorAll('.sort-btn').forEach(btn => {
                const field      = btn.dataset.sort;
                const isActive   = _state.sortBy === field;
                const isDisabled = field === 'position' && !_state.activeSetlist;
                btn.classList.toggle('active', isActive);
                btn.disabled = isDisabled;
                btn.classList.toggle('disabled', isDisabled);
                const icon = btn.querySelector('i');
                if (icon) icon.remove();
                if (isActive) {
                    const i = document.createElement('i');
                    i.className = field === 'position'
                        ? `fa-solid fa-arrow-${_state.sortDir === 'asc' ? 'up' : 'down'}-1-9`
                        : `fa-solid fa-arrow-${_state.sortDir === 'asc' ? 'up' : 'down'}-a-z`;
                    btn.appendChild(i);
                }
            });
        },

        _renderSongList: function () {
            const el = document.getElementById('song-list');
            if (!el) return;

            // Client-side filter
            const filtered = _state.songs.filter(s => {
                if (_state.filterFlag  !== null && (s.status_flag || 0) !== _state.filterFlag) return false;
                if (_state.filterHarm  !== null && !!(s.harmony_str && s.harmony_str.trim()) !== _state.filterHarm) return false;
                if (_state.filterLetra !== null && !!s.has_lyrics !== _state.filterLetra) return false;
                if (_state.filterLink  !== null && !!s.audio_url  !== _state.filterLink)  return false;
                return true;
            });

            // Client-side sort
            const sorted = [...filtered].sort((a, b) => {
                if (_state.sortBy === 'position') {
                    if (a._position === null && b._position === null) return 0;
                    if (a._position === null) return 1;
                    if (b._position === null) return -1;
                    return _state.sortDir === 'asc' ? a._position - b._position : b._position - a._position;
                }
                const colMap = { title: 'title', artist: 'artist', key: 'original_key' };
                const col = colMap[_state.sortBy] || 'title';
                const va = (a[col] || '').toLowerCase();
                const vb = (b[col] || '').toLowerCase();
                if (va < vb) return _state.sortDir === 'asc' ? -1 : 1;
                if (va > vb) return _state.sortDir === 'asc' ?  1 : -1;
                return 0;
            });

            if (sorted.length === 0) {
                el.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-music"></i></div>
                        <h3>Nenhuma música encontrada</h3>
                        <p>Adicione sua primeira música ou ajuste os filtros.</p>
                    </div>`;
                return;
            }

            // ── Show mode: condensed 3-column grid ──
            if (_state.viewMode === 'show') {
                const isDragModeShow = _state.sortBy === 'position' && !!_state.activeSetlist;
                el.innerHTML = RepertoireComponent._renderShowGrid(sorted);
                el.querySelectorAll('.show-cell').forEach(cell => {
                    // Alert toggle button (inside cell, stop propagation)
                    cell.querySelector('.show-alert-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        RepertoireComponent._handleToggleAlert(cell.dataset.id);
                    });
                    // Click opens detail (not on alert btn)
                    cell.addEventListener('click', (e) => {
                        if (e.target.closest('.show-alert-btn')) return;
                        const song = _state.songs.find(s => s.id === cell.dataset.id);
                        if (song) RepertoireComponent._openShowDetail(song);
                    });
                });
                if (isDragModeShow) {
                    RepertoireComponent._bindDragDrop(el, sorted);
                }
                return;
            }

            const isDragMode = _state.sortBy === 'position' && !!_state.activeSetlist;

            const cards = sorted.map(s => {
                const hasHarmony = !!(s.harmony_str && s.harmony_str.trim());
                const hasLyrics  = !!s.has_lyrics;
                const hasAudio   = !!s.audio_url;
                const sf         = s.status_flag || 0;
                const flagTitles = ['Marcar verde', 'Marcar amarelo', 'Marcar vermelho', 'Remover bandeira'];
                return `
                <div class="song-card${sf ? ' song-flag-' + sf : ''}" data-id="${s.id}"
                    ${isDragMode ? 'draggable="true"' : ''}>
                    ${isDragMode ? '<span class="drag-handle" title="Arrastar para reordenar"><i class="fa-solid fa-grip-vertical"></i></span>' : ''}
                    <div class="song-info">
                        <div class="song-title">${esc(s.title)}</div>
                        <div class="song-meta">
                            ${s.artist ? `<span><i class="fa-solid fa-microphone-stand fa-xs"></i> ${esc(s.artist)}</span>` : ''}
                            ${s.genre  ? `<span><i class="fa-solid fa-tag fa-xs"></i> ${esc(s.genre)}</span>` : ''}
                            ${_state.activeSetlist && s._position !== null ? `<span><i class="fa-solid fa-hashtag fa-xs"></i> ${s._position}</span>` : ''}
                        </div>
                    </div>
                    <button class="btn-icon alert-flag sf-${sf}" data-action="alert" data-id="${s.id}"
                        title="${flagTitles[sf]}">
                        <i class="fa-solid fa-flag"></i>
                    </button>
                    <span class="song-key-badge">${esc(s.original_key)}</span>
                    <span class="song-harmony-flag${hasHarmony ? ' has-harmony' : ''}" title="${hasHarmony ? 'Harmonia cadastrada' : 'Sem harmonia'}">
                        <i class="fa-solid fa-music"></i>
                    </span>
                    <span class="song-lyrics-flag${hasLyrics ? ' has-lyrics' : ''}" title="${hasLyrics ? 'Letra cadastrada' : 'Sem letra'}">
                        <i class="fa-solid fa-align-left"></i>
                    </span>
                    <span class="song-audio-flag${hasAudio ? ' has-audio' : ''}" title="${hasAudio ? 'Link MP3' : 'Sem link MP3'}">
                        <i class="fa-solid fa-file-audio"></i>
                    </span>
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
            `; }).join('');

            el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;" id="song-cards-list">${cards}</div>`;

            el.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const { action, id } = btn.dataset;
                    if (action === 'play')   window.HMSApp.navigate('player', id);
                    if (action === 'edit')   RepertoireComponent.openSongModal(id);
                    if (action === 'delete') RepertoireComponent._handleDelete(id);
                    if (action === 'alert')  RepertoireComponent._handleToggleAlert(id);
                });
            });

            // Drag & drop for position sort
            if (isDragMode) {
                RepertoireComponent._bindDragDrop(el, sorted);
            }
        },

        // ── Show Grid ─────────────────────────────────────────────
        _renderShowGrid: function (sorted) {
            const isDragMode = _state.sortBy === 'position' && !!_state.activeSetlist;
            const cells = sorted.map(s => {
                const hasHarmony = !!(s.harmony_str && s.harmony_str.trim());
                const hasLyrics  = !!s.has_lyrics;
                const sf         = s.status_flag || 0;
                const rowCls     = sf ? 'status-flag-' + sf : (hasHarmony ? 'status-ok' : 'status-warn');
                const keyCls     = (!hasHarmony && !hasLyrics) ? ' key-urgent' : '';
                return `<div class="show-cell ${rowCls}" data-id="${s.id}"
                    ${isDragMode ? 'draggable="true"' : ''}>
                    <span class="show-title">${esc(s.title)}</span>
                    <span class="show-key${keyCls}">${esc(s.original_key || '?')}</span>
                    <button class="show-alert-btn sf-${sf}" title="Ciclar bandeira">
                        <i class="fa-solid fa-flag"></i>
                    </button>
                </div>`;
            }).join('');
            return `<div class="show-grid">${cells}</div>`;
        },

        _openShowDetail: function (song) {
            const origKey  = song.original_key || 'C';
            const isMinor  = origKey.endsWith('m');
            const root     = origKey.replace(/m$/, '');
            const tokens   = window.HarmonyEngine.translate(song.harmony_str || '', root, isMinor);

            const SD_KEYS = window.HarmonyEngine.allKeys();
            const keyOptionsHtml = SD_KEYS.map(k =>
                `<option value="${k.value}"${k.value === origKey ? ' selected' : ''}>${k.label}</option>`
            ).join('');

            function buildChordsHtml(toks) {
                return toks.length
                    ? toks.map(t => {
                        if (t.type === 'LABEL')  return `<span class="sd-label">${esc(t.value)}</span>`;
                        if (t.type === 'STRUCT') return `<span class="sd-sep">${esc(t.value) || '·'}</span>`;
                        return `<span class="sd-chord">${esc(t.value)}</span>`;
                      }).join('')
                    : `<span style="color:var(--text-muted);font-size:.85rem;">Sem harmonia cadastrada.</span>`;
            }

            window.HMSApp.openModal(`
                <div class="sd-modal">
                    <div class="sd-header">
                        <div>
                            <div class="sd-title">${esc(song.title)}</div>
                            <div class="sd-sub">${esc([song.artist, song.genre].filter(Boolean).join(' · '))}</div>
                        </div>
                        <span class="song-key-badge" style="font-size:1rem;flex-shrink:0;">${esc(origKey)}</span>
                    </div>
                    ${song.audio_url ? `
                    <audio controls preload="none" src="${esc(song.audio_url)}"
                           style="width:100%;height:36px;margin:4px 0 8px;">
                    </audio>` : ''}
                    <div class="sd-tabs">
                        <button class="sd-tab active" data-tab="func">Harm Func</button>
                        <button class="sd-tab" data-tab="acor">Harm Acor</button>
                        <button class="sd-tab" data-tab="letra">Letra</button>
                    </div>
                    <div class="sd-body">
                        <div class="sd-pane active" id="sd-pane-func">
                            <div class="harmony-preview">${esc(song.harmony_str || 'Sem harmonia cadastrada.')}</div>
                        </div>
                        <div class="sd-pane" id="sd-pane-acor">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                                <span style="font-size:.8rem;color:var(--text-muted);">Tom:</span>
                                <select id="sd-key-select" class="form-input form-select"
                                        style="width:140px;padding:4px 8px;height:32px;">
                                    ${keyOptionsHtml}
                                </select>
                            </div>
                            <div class="sd-chords" id="sd-chords-display">${buildChordsHtml(tokens)}</div>
                        </div>
                        <div class="sd-pane" id="sd-pane-letra">
                            <div id="sd-lyrics-content">
                                ${song.has_lyrics
                                    ? `<div class="content-loader" style="padding:12px;"><div class="loader-spinner" style="width:20px;height:20px;border-width:2px;"></div></div>`
                                    : `<p style="color:var(--text-muted);font-size:.85rem;">Sem letra cadastrada.</p>`}
                            </div>
                        </div>
                    </div>
                </div>
            `);

            document.querySelectorAll('.sd-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.sd-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.sd-pane').forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(`sd-pane-${tab.dataset.tab}`).classList.add('active');
                });
            });

            document.getElementById('sd-key-select')?.addEventListener('change', function () {
                const newIsMinor = this.value.endsWith('m');
                const newRoot = this.value.replace(/m$/, '');
                const newTokens = window.HarmonyEngine.translate(song.harmony_str || '', newRoot, newIsMinor);
                document.getElementById('sd-chords-display').innerHTML = buildChordsHtml(newTokens);
            });

            if (song.has_lyrics) {
                window.HMSAPI.Songs.getById(song.id).then(full => {
                    const el = document.getElementById('sd-lyrics-content');
                    if (el) el.innerHTML = full.lyrics
                        ? `<pre style="white-space:pre-wrap;font-family:var(--font-ui);font-size:.85rem;color:var(--text-secondary);line-height:1.7;">${esc(full.lyrics)}</pre>`
                        : `<p style="color:var(--text-muted);font-size:.85rem;">Letra não encontrada.</p>`;
                }).catch(() => {});
            }
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
                            <div class="form-group form-group-full">
                                <label class="form-label">URL do Áudio (MP3)</label>
                                <input type="url" id="sf-audio-url" class="form-input"
                                    placeholder="https://…/musica.mp3"
                                    value="${esc(song?.audio_url || '')}" />
                                <span class="form-hint">Link direto para o arquivo MP3 (Supabase Storage, CDN, etc.)</span>
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
                // 1. Try lrclib.net (plain artist name, then "Grupo " prefix fallback)
                setStatus('lrclib…');
                let lyrics = null;

                const _lrclibFetch = async (artistName) => {
                    const res = await fetch(
                        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(title)}`,
                        { signal: AbortSignal.timeout(9000) }
                    );
                    if (!res.ok) return null;
                    const data = await res.json();
                    return data.plainLyrics || data.syncedLyrics || null;
                };

                try {
                    lyrics = await _lrclibFetch(artist);
                    // Fallback: try with "Grupo " prefix if the original search failed
                    if (!lyrics && !artist.startsWith('Grupo ')) {
                        lyrics = await _lrclibFetch('Grupo ' + artist);
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

            const audioUrl = (document.getElementById('sf-audio-url').value || '').trim();
            const payload = {
                title, artist: artist || null,
                genre: genre || null, original_key: originalKey,
                harmony_str: harmonyStr, lyrics: lyrics || null,
                audio_url: audioUrl || null,
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
                // If the player is showing this song, refresh it with the new data
                if (editId && window.App._currentRoute === 'player') {
                    window.PlayerComponent.render(editId);
                }
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

        // ── CSV Import ────────────────────────────────────────────
        // Parser for Excel-style semicolon CSV (handles quoted fields + "" escaping)
        _parseCSVLine: function (line) {
            const cols = [];
            let cur = '', inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (inQuote) {
                    if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                    else if (c === '"')                    { inQuote = false; }
                    else                                   { cur += c; }
                } else {
                    // Only treat " as field delimiter when at the very start of a field.
                    // Mid-field " (e.g. HMS hidden-target notation 5/"3") is kept literal.
                    if (c === '"' && cur.trim() === '') { inQuote = true; }
                    else if (c === '"')                 { cur += '"'; }
                    else if (c === ';')                 { cols.push(cur.trim()); cur = ''; }
                    else                                { cur += c; }
                }
            }
            cols.push(cur.trim());
            return cols;
        },

        _importCSV: function (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const lines = e.target.result
                    .split('\n')
                    .map(l => l.replace(/\r$/, ''))
                    .filter(Boolean);

                if (lines.length < 2) {
                    window.HMSApp.showToast('Arquivo vazio ou inválido.', 'warning');
                    return;
                }

                // Detect if first row is the header (Nome;Artista…)
                const firstCols = RepertoireComponent._parseCSVLine(lines[0]);
                const hasHeader = firstCols[0].toLowerCase() === 'nome' ||
                                  firstCols[0].toLowerCase() === 'título' ||
                                  firstCols[0].toLowerCase() === 'titulo';
                const dataLines = hasHeader ? lines.slice(1) : lines;

                const songs    = [];   // { title, artist, genre, original_key, harmony_str }
                const setlinks = [];   // { titleKey, setlistName, position }

                for (const line of dataLines) {
                    if (!line.trim()) continue;
                    const cols = RepertoireComponent._parseCSVLine(line);

                    const title   = cols[0] || '';
                    const artist  = cols[1] || '';
                    const genre   = cols[2] || '';
                    const playlistRaw = cols[3] || '';
                    // Rename source playlist to the real setlist name
                    const playlist = playlistRaw === 'Luquinhas' ? 'Banda Mahalo' : playlistRaw;
                    const n1      = cols[4] || '';
                    const key     = cols[5] || '';
                    const harmony = cols[6] || '';

                    if (!title || !artist) continue;

                    const harmonyUpper = harmony.trim().toUpperCase();
                    const harmonyStr = (harmonyUpper === 'TIRAR' || harmonyUpper === '-') ? '' : harmony.trim();
                    const titleKey   = `${title.toLowerCase()}||${artist.toLowerCase()}`;

                    songs.push({
                        title,
                        artist,
                        genre:        genre || null,
                        original_key: key,
                        harmony_str:  harmonyStr,
                        _titleKey:    titleKey,   // used internally, removed before insert
                    });

                    if (playlist && /^\d+$/.test(n1)) {
                        setlinks.push({
                            titleKey,
                            setlistName: playlist,
                            position:    parseInt(n1, 10),
                        });
                    }
                }

                if (songs.length === 0) {
                    window.HMSApp.showToast('Nenhuma música válida encontrada no CSV.', 'warning');
                    return;
                }

                // Group setlinks by setlist name
                const setlistNames = [...new Set(setlinks.map(l => l.setlistName))];

                RepertoireComponent._showImportModal(songs, setlinks, setlistNames);
            };
            reader.readAsText(file, 'utf-8');
        },

        _showImportModal: function (songs, setlinks, setlistNames) {
            const setlistSummary = setlistNames.length
                ? setlistNames.map(n => {
                    const count = setlinks.filter(l => l.setlistName === n).length;
                    return `<strong>${count}</strong> na setlist <em>${esc(n)}</em>`;
                  }).join(', ')
                : 'nenhuma setlist';

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-file-import"></i> Importar CSV</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
                        <div style="flex:1;min-width:120px;background:var(--bg-deep);border-radius:8px;padding:10px 14px;text-align:center;">
                            <div style="font-size:1.6rem;font-weight:700;color:var(--accent);">${songs.length}</div>
                            <div style="font-size:.75rem;color:var(--text-muted);">músicas</div>
                        </div>
                        <div style="flex:1;min-width:120px;background:var(--bg-deep);border-radius:8px;padding:10px 14px;text-align:center;">
                            <div style="font-size:1.6rem;font-weight:700;color:var(--chord-blue);">${setlinks.length}</div>
                            <div style="font-size:.75rem;color:var(--text-muted);">com posição em setlist</div>
                        </div>
                    </div>
                    <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:10px;">
                        Setlists detectadas: ${setlistSummary}
                    </p>
                    <div style="max-height:200px;overflow-y:auto;border:1px solid var(--glass-border);border-radius:6px;padding:8px;font-size:.78rem;line-height:1.7;">
                        ${songs.map((s, i) => {
                            const link = setlinks.find(l => l.titleKey === s._titleKey);
                            const badge = link
                                ? `<span style="color:var(--chord-blue);margin-left:4px;">#${link.position}</span>`
                                : '';
                            return `<div>${i + 1}. <strong>${esc(s.title)}</strong> — ${esc(s.artist)}
                                <span style="color:var(--text-muted);font-size:.72rem;"> · ${esc(s.original_key)}</span>${badge}</div>`;
                        }).join('')}
                    </div>
                    <div id="import-progress" style="margin-top:14px;display:none;">
                        <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:6px;" id="import-status">Importando…</div>
                        <div style="background:var(--glass-border);border-radius:4px;height:6px;">
                            <div id="import-bar" style="background:var(--accent);height:6px;border-radius:4px;width:0%;transition:width .2s;"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
                    <button class="btn btn-primary" id="btn-confirm-import">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Importar tudo
                    </button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('btn-confirm-import').addEventListener('click', () => {
                RepertoireComponent._runImport(songs, setlinks, setlistNames);
            });
        },

        _runImport: async function (songs, setlinks, setlistNames) {
            const progressEl = document.getElementById('import-progress');
            const statusEl   = document.getElementById('import-status');
            const barEl      = document.getElementById('import-bar');
            const confirmBtn = document.getElementById('btn-confirm-import');
            const cancelBtn  = document.getElementById('modal-cancel-btn');

            progressEl.style.display = 'block';
            confirmBtn.disabled = true;
            cancelBtn.disabled  = true;

            const setProgress = (pct, msg) => {
                barEl.style.width = pct + '%';
                statusEl.textContent = msg;
            };

            try {
                // 1. Insert songs in batches of 50
                const BATCH = 50;
                let inserted = [];
                for (let i = 0; i < songs.length; i += BATCH) {
                    const batch = songs.slice(i, i + BATCH).map(({ _titleKey, ...s }) => s);
                    const created = await window.HMSAPI.Songs.bulkCreate(batch);
                    // Reattach _titleKey for matching (same order as input)
                    created.forEach((row, j) => {
                        row._titleKey = songs[i + j]._titleKey;
                    });
                    inserted = inserted.concat(created);
                    setProgress(Math.round(inserted.length / songs.length * 70), `${inserted.length} / ${songs.length} músicas…`);
                }

                // 2. Create setlists (skip if already exists)
                if (setlinks.length > 0) {
                    setProgress(75, 'Criando setlists…');
                    await RepertoireComponent._loadSetlists();
                    const setlistMap = {}; // name → id

                    for (const name of setlistNames) {
                        let sl = _state.setlists.find(s => s.name.toLowerCase() === name.toLowerCase());
                        if (!sl) sl = await window.HMSAPI.Setlists.create(name);
                        setlistMap[name] = sl.id;
                    }

                    // 3. Link songs to setlists with position
                    setProgress(80, 'Vinculando setlists…');
                    const titleKeyToId = {};
                    inserted.forEach(r => { titleKeyToId[r._titleKey] = r.id; });

                    let linked = 0;
                    for (const link of setlinks) {
                        const songId = titleKeyToId[link.titleKey];
                        const slId   = setlistMap[link.setlistName];
                        if (songId && slId) {
                            await window.HMSAPI.Setlists.addSong(slId, songId, link.position);
                            linked++;
                        }
                    }
                    setProgress(100, `${inserted.length} músicas e ${linked} vínculos criados.`);
                } else {
                    setProgress(100, `${inserted.length} músicas importadas.`);
                }

                await new Promise(r => setTimeout(r, 600)); // brief pause to show 100%
                window.HMSApp.closeModal();
                window.HMSApp.showToast(`${inserted.length} músicas importadas com sucesso!`, 'success');
                await RepertoireComponent._loadSetlists();
                await RepertoireComponent._loadSongs();
            } catch (err) {
                statusEl.textContent = 'Erro: ' + err.message;
                statusEl.style.color = 'var(--danger)';
                confirmBtn.disabled = false;
                cancelBtn.disabled  = false;
            }
        },

        // ── Bulk Lyrics Fetch ─────────────────────────────────────
        _bulkFetchLyrics: function () {
            const withoutLyrics = _state.songs.filter(s => !s.has_lyrics);
            const total = withoutLyrics.length;
            const totalAll = _state.songs.length;

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-wand-magic-sparkles"></i> Buscar Letras em Massa</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <p style="font-size:.875rem;color:var(--text-muted);margin-bottom:14px;">
                        <strong style="color:var(--text-primary);">${total}</strong> músicas sem letra
                        de <strong style="color:var(--text-primary);">${totalAll}</strong> no repertório atual.<br>
                        Fonte: <strong>lrclib.net</strong> (com fallback "Grupo " para pagode/samba). Delay de 300ms entre buscas.
                    </p>
                    <div id="bulk-progress" style="display:none;">
                        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:6px;" id="bulk-status">Iniciando…</div>
                        <div style="background:var(--glass-border);border-radius:4px;height:6px;margin-bottom:10px;">
                            <div id="bulk-bar" style="background:var(--brand);height:6px;border-radius:4px;width:0%;transition:width .2s;"></div>
                        </div>
                        <div id="bulk-log" style="max-height:200px;overflow-y:auto;font-size:.75rem;font-family:var(--font-mono);line-height:1.7;color:var(--text-secondary);"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                    <button class="btn btn-primary" id="btn-start-bulk" ${total === 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-play"></i> Iniciar (${total} músicas)
                    </button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('btn-start-bulk').addEventListener('click', () => {
                RepertoireComponent._runBulkFetch(withoutLyrics);
            });
        },

        _runBulkFetch: async function (songs) {
            const progressEl = document.getElementById('bulk-progress');
            const statusEl   = document.getElementById('bulk-status');
            const barEl      = document.getElementById('bulk-bar');
            const logEl      = document.getElementById('bulk-log');
            const startBtn   = document.getElementById('btn-start-bulk');
            const cancelBtn  = document.getElementById('modal-cancel-btn');

            progressEl.style.display = 'block';
            startBtn.disabled = true;
            cancelBtn.disabled = true;

            const lrclibFetch = async (artistName, title) => {
                const res = await fetch(
                    `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(title)}`,
                    { signal: AbortSignal.timeout(9000) }
                );
                if (!res.ok) return null;
                const data = await res.json();
                return data.plainLyrics || data.syncedLyrics || null;
            };

            const addLog = (msg) => {
                logEl.textContent += msg + '\n';
                logEl.scrollTop = logEl.scrollHeight;
            };

            let found = 0, notFound = 0;
            const total = songs.length;

            for (let i = 0; i < songs.length; i++) {
                const s = songs[i];
                const pct = Math.round((i / total) * 100);
                barEl.style.width = pct + '%';
                statusEl.textContent = `${i + 1} / ${total} — ${s.title}`;

                let lyrics = null;
                try {
                    lyrics = await lrclibFetch(s.artist || '', s.title);
                    if (!lyrics && s.artist && !s.artist.startsWith('Grupo ')) {
                        lyrics = await lrclibFetch('Grupo ' + s.artist, s.title);
                    }
                } catch { /* network */ }

                if (lyrics) {
                    try {
                        await window.HMSAPI.Songs.update(s.id, { lyrics: lyrics.trim() });
                        found++;
                        addLog(`✓ ${s.title} — ${s.artist}`);
                    } catch (err) {
                        addLog(`✗ Erro ao salvar "${s.title}": ${err.message}`);
                    }
                } else {
                    notFound++;
                    addLog(`– Não encontrado: ${s.title} — ${s.artist}`);
                }

                // Rate limiting: 300ms between requests
                if (i < songs.length - 1) await new Promise(r => setTimeout(r, 300));
            }

            barEl.style.width = '100%';
            statusEl.textContent = `Concluído: ${found} letras encontradas, ${notFound} não encontradas.`;
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Fechar';
            window.HMSApp.showToast(`${found} letras salvas!`, 'success');
            await RepertoireComponent._loadSongs();
        },

        // ── Bulk Hygienize ────────────────────────────────────────
        _bulkHygienize: async function () {
            window.HMSApp.showLoading();
            let allSongs;
            try {
                allSongs = await window.HMSAPI.Songs.getAll();
            } catch (err) {
                window.HMSApp.hideLoading();
                window.HMSApp.showToast('Erro ao carregar músicas: ' + err.message, 'error');
                return;
            }
            window.HMSApp.hideLoading();

            const candidates = allSongs
                .filter(s => s.harmony_str && s.harmony_str.trim())
                .map(s => ({ ...s, _sanitized: window.HarmonyEngine.sanitize(s.harmony_str) }))
                .filter(s => s._sanitized !== s.harmony_str);

            const total    = candidates.length;
            const totalAll = allSongs.filter(s => s.harmony_str && s.harmony_str.trim()).length;

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-broom"></i> Higienização de Harmonias</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <p style="font-size:.875rem;color:var(--text-muted);margin-bottom:14px;">
                        <strong style="color:var(--text-primary);">${total}</strong> músicas com texto não-harmônico
                        de <strong style="color:var(--text-primary);">${totalAll}</strong> com harmonia cadastrada.
                        Texto livre será envolvido em <code style="background:var(--glass-bg);padding:1px 5px;border-radius:4px;">$...$</code>.
                    </p>
                    ${total === 0 ? `
                        <div style="text-align:center;padding:24px 0;color:var(--text-muted);">
                            <i class="fa-solid fa-circle-check" style="font-size:2rem;color:var(--brand);margin-bottom:8px;display:block;"></i>
                            Todas as harmonias estão higienizadas!
                        </div>
                    ` : `
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                            <input type="checkbox" id="chk-select-all" checked />
                            <label for="chk-select-all" style="font-size:.82rem;color:var(--text-secondary);cursor:pointer;">Selecionar todas (${total})</label>
                        </div>
                        <div id="hygiene-list" style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
                            ${candidates.map((s, idx) => `
                                <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;padding:10px 12px;">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
                                        <input type="checkbox" class="hygiene-chk" data-idx="${idx}" checked />
                                        <strong style="font-size:.875rem;">${esc(s.title)}</strong>
                                        ${s.artist ? `<span style="font-size:.78rem;color:var(--text-muted);">— ${esc(s.artist)}</span>` : ''}
                                    </div>
                                    <div style="font-size:.72rem;font-family:var(--font-mono);line-height:1.9;display:flex;flex-direction:column;gap:3px;">
                                        <div style="color:var(--text-secondary);">+ ${esc(s.harmony_str)}</div>
                                        <div style="color:#f87171;opacity:.75;">− ${esc(s._sanitized)}</div>
                                        <div style="display:flex;align-items:center;gap:6px;">
                                            <span style="color:var(--text-muted);">--</span>
                                            <input class="hygiene-edit form-input" data-idx="${idx}"
                                                value="${esc(s._sanitized)}"
                                                style="flex:1;font-family:var(--font-mono);font-size:.72rem;padding:3px 7px;background:var(--bg-raised);border-radius:4px;" />
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div id="hygiene-progress" style="display:none;margin-top:12px;">
                            <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:6px;" id="hygiene-status">Iniciando…</div>
                            <div style="background:var(--glass-border);border-radius:4px;height:6px;">
                                <div id="hygiene-bar" style="background:var(--brand);height:6px;border-radius:4px;width:0%;transition:width .2s;"></div>
                            </div>
                        </div>
                    `}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                    ${total > 0 ? `<button class="btn btn-primary" id="btn-apply-hygiene"><i class="fa-solid fa-broom"></i> Aplicar selecionadas</button>` : ''}
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            if (total > 0) {
                document.getElementById('chk-select-all').addEventListener('change', (e) => {
                    document.querySelectorAll('.hygiene-chk').forEach(chk => { chk.checked = e.target.checked; });
                });

                document.getElementById('btn-apply-hygiene').addEventListener('click', () => {
                    const selected = [...document.querySelectorAll('.hygiene-chk:checked')]
                        .map(chk => {
                            const idx = parseInt(chk.dataset.idx);
                            const editInput = document.querySelector(`.hygiene-edit[data-idx="${idx}"]`);
                            return { ...candidates[idx], _sanitized: editInput ? editInput.value.trim() : candidates[idx]._sanitized };
                        })
                        .filter(s => s._sanitized);
                    if (selected.length === 0) {
                        window.HMSApp.showToast('Nenhuma música selecionada.', 'warning');
                        return;
                    }
                    RepertoireComponent._runBulkHygienize(selected);
                });
            }
        },

        _runBulkHygienize: async function (selected) {
            const progressEl = document.getElementById('hygiene-progress');
            const statusEl   = document.getElementById('hygiene-status');
            const barEl      = document.getElementById('hygiene-bar');
            const applyBtn   = document.getElementById('btn-apply-hygiene');
            const cancelBtn  = document.getElementById('modal-cancel-btn');
            const listEl     = document.getElementById('hygiene-list');

            progressEl.style.display = 'block';
            applyBtn.disabled = true;
            cancelBtn.disabled = true;
            if (listEl) listEl.style.opacity = '.45';

            let ok = 0, fail = 0;
            const total = selected.length;

            for (let i = 0; i < selected.length; i++) {
                const s = selected[i];
                statusEl.textContent = `${i + 1} / ${total} — ${s.title}`;
                barEl.style.width = Math.round((i / total) * 100) + '%';
                try {
                    await window.HMSAPI.Songs.update(s.id, { harmony_str: s._sanitized });
                    ok++;
                } catch (err) {
                    fail++;
                    console.warn(`[Hygienize] "${s.title}":`, err.message);
                }
            }

            barEl.style.width = '100%';
            statusEl.textContent = `Concluído: ${ok} atualizadas${fail > 0 ? `, ${fail} falhas` : ''}.`;
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Fechar';
            window.HMSApp.showToast(`${ok} harmonias higienizadas!`, 'success');
            await RepertoireComponent._loadSongs();
        },

        // ── Import Harmony from Excel (.xlsx) ────────────────────
        // Expects: col A = song title, col B = harmony_str
        // Matches by title (case-insensitive), updates harmony_str in DB.
        _importHarmonyXlsx: function (file) {
            if (!window.XLSX) {
                window.HMSApp.showToast('SheetJS não carregado ainda. Tente novamente.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = async (e) => {
                const wb   = window.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const ws   = wb.Sheets[wb.SheetNames[0]];
                const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                // Skip header row if first cell looks like a label
                const firstCell = String(rows[0]?.[0] || '').toLowerCase();
                const dataRows  = /título|titulo|nome|music|song|name/i.test(firstCell)
                    ? rows.slice(1)
                    : rows;

                // Build map: title_lower → harmony_str
                const xlsxMap = {};
                for (const row of dataRows) {
                    const title   = String(row[0] || '').trim();
                    const harmony = String(row[1] || '').trim();
                    if (title) xlsxMap[title.toLowerCase()] = harmony;
                }

                // Load all songs to match
                window.HMSApp.showLoading();
                let allSongs;
                try {
                    allSongs = await window.HMSAPI.Songs.getAll();
                } catch (err) {
                    window.HMSApp.hideLoading();
                    window.HMSApp.showToast('Erro ao carregar músicas: ' + err.message, 'error');
                    return;
                }
                window.HMSApp.hideLoading();

                const matched   = [];
                const unmatched = [];

                for (const song of allSongs) {
                    const key = song.title.toLowerCase();
                    if (xlsxMap[key] !== undefined) {
                        matched.push({ ...song, _newHarmony: xlsxMap[key] });
                    }
                }
                for (const title of Object.keys(xlsxMap)) {
                    if (!allSongs.find(s => s.title.toLowerCase() === title)) {
                        unmatched.push(title);
                    }
                }

                const changed = matched.filter(s => s._newHarmony !== (s.harmony_str || ''));

                window.HMSApp.openModal(`
                    <div class="modal-header">
                        <h3><i class="fa-solid fa-file-excel"></i> Atualizar Harmonias</h3>
                        <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="modal-body">
                        <p style="font-size:.875rem;color:var(--text-muted);margin-bottom:12px;">
                            Planilha: <strong style="color:var(--text-primary);">${Object.keys(xlsxMap).length}</strong> linhas —
                            <strong style="color:var(--brand);">${changed.length}</strong> músicas com harmonia diferente,
                            <strong style="color:#f87171;">${unmatched.length}</strong> títulos sem correspondência no banco.
                        </p>
                        ${unmatched.length > 0 ? `
                            <details style="margin-bottom:10px;">
                                <summary style="font-size:.78rem;color:#f87171;cursor:pointer;">Ver títulos não encontrados (${unmatched.length})</summary>
                                <div style="font-size:.72rem;font-family:var(--font-mono);color:var(--text-muted);padding:6px 0;line-height:1.8;">
                                    ${unmatched.map(t => esc(t)).join('<br>')}
                                </div>
                            </details>
                        ` : ''}
                        ${changed.length === 0 ? `
                            <div style="text-align:center;padding:20px 0;color:var(--text-muted);">
                                <i class="fa-solid fa-circle-check" style="font-size:2rem;color:var(--brand);margin-bottom:8px;display:block;"></i>
                                Nenhuma harmonia diferente encontrada.
                            </div>
                        ` : `
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                                <input type="checkbox" id="chk-harmony-all" checked />
                                <label for="chk-harmony-all" style="font-size:.82rem;color:var(--text-secondary);cursor:pointer;">Selecionar todas (${changed.length})</label>
                            </div>
                            <div id="harmony-import-list" style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
                                ${changed.map((s, idx) => `
                                    <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;padding:10px 12px;">
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
                                            <input type="checkbox" class="harmony-import-chk" data-idx="${idx}" checked />
                                            <strong style="font-size:.875rem;">${esc(s.title)}</strong>
                                            ${s.artist ? `<span style="font-size:.78rem;color:var(--text-muted);">— ${esc(s.artist)}</span>` : ''}
                                        </div>
                                        <div style="font-size:.72rem;font-family:var(--font-mono);line-height:1.8;display:flex;flex-direction:column;gap:2px;">
                                            <div style="color:var(--text-muted);">+ ${esc(s.harmony_str || '(vazio)')}</div>
                                            <div style="color:var(--brand);">− ${esc(s._newHarmony || '(vazio)')}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                            <div id="harmony-import-progress" style="display:none;margin-top:12px;">
                                <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:6px;" id="harmony-import-status">Iniciando…</div>
                                <div style="background:var(--glass-border);border-radius:4px;height:6px;">
                                    <div id="harmony-import-bar" style="background:var(--brand);height:6px;border-radius:4px;width:0%;transition:width .2s;"></div>
                                </div>
                            </div>
                        `}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                        ${changed.length > 0 ? `<button class="btn btn-primary" id="btn-apply-harmony-import"><i class="fa-solid fa-floppy-disk"></i> Aplicar selecionadas</button>` : ''}
                    </div>
                `);

                document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
                document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

                if (changed.length > 0) {
                    document.getElementById('chk-harmony-all').addEventListener('change', (ev) => {
                        document.querySelectorAll('.harmony-import-chk').forEach(c => { c.checked = ev.target.checked; });
                    });

                    document.getElementById('btn-apply-harmony-import').addEventListener('click', async () => {
                        const selected = [...document.querySelectorAll('.harmony-import-chk:checked')]
                            .map(chk => changed[parseInt(chk.dataset.idx)]);
                        if (selected.length === 0) {
                            window.HMSApp.showToast('Nenhuma música selecionada.', 'warning');
                            return;
                        }

                        const progressEl = document.getElementById('harmony-import-progress');
                        const statusEl   = document.getElementById('harmony-import-status');
                        const barEl      = document.getElementById('harmony-import-bar');
                        const applyBtn   = document.getElementById('btn-apply-harmony-import');
                        const cancelBtn  = document.getElementById('modal-cancel-btn');
                        const listEl     = document.getElementById('harmony-import-list');

                        progressEl.style.display = 'block';
                        applyBtn.disabled = true;
                        cancelBtn.disabled = true;
                        if (listEl) listEl.style.opacity = '.45';

                        let ok = 0, fail = 0;
                        for (let i = 0; i < selected.length; i++) {
                            const s = selected[i];
                            statusEl.textContent = `${i + 1} / ${selected.length} — ${s.title}`;
                            barEl.style.width = Math.round((i / selected.length) * 100) + '%';
                            try {
                                await window.HMSAPI.Songs.update(s.id, { harmony_str: s._newHarmony });
                                ok++;
                            } catch (err) {
                                fail++;
                                console.warn(`[HarmonyImport] "${s.title}":`, err.message);
                            }
                        }

                        barEl.style.width = '100%';
                        statusEl.textContent = `Concluído: ${ok} atualizadas${fail > 0 ? `, ${fail} falhas` : ''}.`;
                        cancelBtn.disabled = false;
                        cancelBtn.textContent = 'Fechar';
                        window.HMSApp.showToast(`${ok} harmonias atualizadas!`, 'success');
                        await RepertoireComponent._loadSongs();
                    });
                }
            };
            reader.readAsArrayBuffer(file);
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

        // ── Status flag (0=none 1=green 2=yellow 3=red) ──────────
        _handleToggleAlert: async function (id) {
            const song = _state.songs.find(s => s.id === id);
            if (!song) return;
            const newVal = ((song.status_flag || 0) + 1) % 4;
            try {
                await window.HMSAPI.Songs.update(id, { status_flag: newVal });
                song.status_flag = newVal;
                RepertoireComponent._renderSongList();
            } catch (err) {
                window.HMSApp.showToast('Erro ao atualizar bandeira: ' + err.message, 'error');
            }
        },

        // ── Drag & Drop (position sort) ───────────────────────────
        _bindDragDrop: function (container, sorted) {
            const cards = container.querySelectorAll('[data-id][draggable]');
            cards.forEach(card => {
                card.addEventListener('dragstart', (e) => {
                    _dragSongId = card.dataset.id;
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                card.addEventListener('dragend', () => {
                    card.classList.remove('dragging');
                    container.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
                });
                card.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (card.dataset.id !== _dragSongId) {
                        container.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
                        card.classList.add('drag-over');
                    }
                });
                card.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const targetId = card.dataset.id;
                    if (!_dragSongId || _dragSongId === targetId) return;

                    // Reorder _state.songs based on sorted array positions
                    const sortedIds = sorted.map(s => s.id);
                    const fromIdx   = sortedIds.indexOf(_dragSongId);
                    const toIdx     = sortedIds.indexOf(targetId);
                    if (fromIdx === -1 || toIdx === -1) return;

                    // Splice in _state.songs (need to find by id, order may differ)
                    const fromSong = _state.songs.find(s => s.id === _dragSongId);
                    const toSong   = _state.songs.find(s => s.id === targetId);
                    if (!fromSong || !toSong) return;

                    // Swap _position values
                    const tempPos = fromSong._position;
                    fromSong._position = toSong._position;
                    toSong._position   = tempPos;

                    // Re-assign positions sequentially to avoid collisions
                    const sortedByPos = [..._state.songs]
                        .filter(s => s._position !== null && s._position !== undefined)
                        .sort((a, b) => a._position - b._position);
                    sortedByPos.forEach((s, i) => { s._position = i + 1; });

                    // Save to DB
                    RepertoireComponent._savePositions();
                    RepertoireComponent._renderSongList();
                });
            });
        },

        _savePositions: async function () {
            if (!_state.activeSetlist) return;
            const songsWithPos = _state.songs.filter(s => s._position !== null && s._position !== undefined);
            try {
                await Promise.all(
                    songsWithPos.map(s =>
                        window.HMSAPI.Setlists.addSong(_state.activeSetlist, s.id, s._position)
                    )
                );
            } catch (err) {
                window.HMSApp.showToast('Erro ao salvar posições: ' + err.message, 'error');
            }
        },

        // ── Setlist Song Manager ──────────────────────────────────
        _openSetlistSongManager: async function () {
            const sl = _state.setlists.find(s => s.id === _state.activeSetlist);
            if (!sl) return;

            // Load all songs for search (without setlist filter)
            let allSongs;
            try {
                window.HMSApp.showLoading();
                allSongs = await window.HMSAPI.Songs.getAll();
            } catch (err) {
                window.HMSApp.showToast('Erro ao carregar músicas: ' + err.message, 'error');
                return;
            } finally {
                window.HMSApp.hideLoading();
            }

            // IDs already in setlist
            const inSetlistIds = new Set(_state.songs.map(s => s.id));

            const renderList = (query) => {
                const filtered = query
                    ? allSongs.filter(s =>
                        s.title.toLowerCase().includes(query.toLowerCase()) ||
                        (s.artist || '').toLowerCase().includes(query.toLowerCase())
                      )
                    : allSongs;
                if (!filtered.length) return '<p style="color:var(--text-muted);font-size:.85rem;padding:8px 0;">Nenhuma música encontrada.</p>';
                return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">` +
                    filtered.map(s => {
                        const inSet = inSetlistIds.has(s.id);
                        return `<div style="display:flex;flex-direction:column;gap:4px;padding:8px;
                                border:1px solid ${inSet ? 'var(--brand)' : 'var(--glass-border)'};
                                border-radius:6px;background:${inSet ? 'var(--brand-dim)' : 'var(--bg-raised)'};">
                            <div style="font-size:.8rem;font-weight:600;line-height:1.3;overflow:hidden;
                                display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(s.title)}</div>
                            <div style="display:flex;align-items:center;gap:4px;margin-top:auto;">
                                <span class="song-key-badge" style="font-size:.65rem;">${esc(s.original_key || '?')}</span>
                                <button class="btn btn-sm ${inSet ? 'btn-secondary sl-remove-btn' : 'btn-primary sl-add-btn'}"
                                    data-songid="${s.id}" style="margin-left:auto;padding:2px 8px;font-size:.72rem;">
                                    ${inSet ? '<i class="fa-solid fa-minus"></i>' : '<i class="fa-solid fa-plus"></i>'}
                                </button>
                            </div>
                        </div>`;
                    }).join('') + `</div>`;
            };

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-list-check"></i> Músicas — ${esc(sl.name)}</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div class="search-bar" style="margin-bottom:12px;">
                        <input type="text" id="sm-search" class="form-input" placeholder="Buscar música…" />
                    </div>
                    <div id="sm-list" style="max-height:520px;overflow-y:auto;">
                        ${renderList('')}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                </div>
            `);
            document.getElementById('modal-container').classList.add('modal-lg');

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            document.getElementById('sm-search').addEventListener('input', (e) => {
                document.getElementById('sm-list').innerHTML = renderList(e.target.value.trim());
                bindSmButtons();
            });

            const bindSmButtons = () => {
                document.querySelectorAll('.sl-add-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const songId = btn.dataset.songid;
                        const nextPos = _state.songs.length
                            ? Math.max(..._state.songs.map(s => s._position || 0)) + 1
                            : 1;
                        try {
                            await window.HMSAPI.Setlists.addSong(_state.activeSetlist, songId, nextPos);
                            inSetlistIds.add(songId);
                            btn.className = 'btn btn-sm btn-secondary sl-remove-btn';
                            btn.dataset.songid = songId;
                            btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                            await RepertoireComponent._loadSongs();
                            bindSmButtons();
                            window.HMSApp.showToast('Música adicionada à setlist!', 'success');
                        } catch (err) {
                            window.HMSApp.showToast('Erro: ' + err.message, 'error');
                        }
                    });
                });
                document.querySelectorAll('.sl-remove-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const songId = btn.dataset.songid;
                        try {
                            await window.HMSAPI.Setlists.removeSong(_state.activeSetlist, songId);
                            inSetlistIds.delete(songId);
                            btn.className = 'btn btn-sm btn-primary sl-add-btn';
                            btn.dataset.songid = songId;
                            btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                            await RepertoireComponent._loadSongs();
                            bindSmButtons();
                            window.HMSApp.showToast('Música removida da setlist.', 'success');
                        } catch (err) {
                            window.HMSApp.showToast('Erro: ' + err.message, 'error');
                        }
                    });
                });
            };
            bindSmButtons();
        },
    };

    window.RepertoireComponent = RepertoireComponent;
    console.info('[HMS] RepertoireComponent loaded.');
})();
