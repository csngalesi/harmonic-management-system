/**
 * HMS — Repertoire Component (Dashboard)
 * Song list with search, setlist filters, and CRUD modal.
 * Exposed via window.RepertoireComponent
 */
(function () {
    'use strict';

    // Vagalume API key — register free at https://api.vagalume.com.br
    const VAGALUME_KEY    = '';

    // Musixmatch é chamado via Supabase Edge Function (server-side).
    // A API key fica segura como secret no Supabase — não exposta no frontend.

    let _state = {
        songs:        [],
        setlists:     [],
        activeSetlist: '',
        searchQuery:  '',
        searchType:   'all',      // 'all' | 'title' | 'artist' | 'genre' | 'harmony'
        sortBy:       'title',    // 'title' | 'artist' | 'key' | 'position'
        sortDir:      'asc',      // 'asc' | 'desc'
        viewMode:        'show',     // 'list' | 'show'
        showColumns:     'N',         // 'S'=1col | 'N'=responsive | '2'-'5'
        showFlow:        'row',        // 'row' = leitura linha a linha | 'col' = leitura por coluna
        showDragMode:    false,        // true = grid arrastável para reordenar posições
        headerCollapsed: false,
        // Client-side filters (null = sem filtro)
        filterFlag:  null,   // null | 0 | 1 | 2 | 3
        filterHarm:  null,   // null | true | false
        filterLetra: null,   // null | true | false
        filterLink:  null,   // null | true | false
        filterKey:   null,   // null | 'C' | 'G' | ...
    };

    // Snapshot of positions before any drag in the current drag session.
    // Used by _savePositions to send only the changed rows to the DB.
    let _originalPositions = {}; // { songId: position }
    let _hasUnsavedOrder   = false;
    let _isSaving          = false; // previne double-save



    // Drag state for position reordering
    let _dragSongId = null;

    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const KEYS = window.HarmonyEngine.allKeys();
    const keyLabel = v => { const k = KEYS.find(k => k.value === v); return k ? k.value : v; };

    const RepertoireComponent = {

        render: async function () {
            const content = document.getElementById('main-content');
            // Restore saved preferences before building the UI so initial state matches user's defaults
            await RepertoireComponent._loadPrefs();
            // Reset volatile drag state — these must not carry over between navigations
            _state.showDragMode = false;
            _hasUnsavedOrder    = false;
            _originalPositions  = {};
            _dragSongId         = null;
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
                        <span id="key-filter-header" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px;margin-left:10px;"></span>
                    </div>
                    <div class="page-actions"${_state.headerCollapsed ? ' style="display:none"' : ''}>
                        <button class="btn btn-secondary${_state.viewMode === 'show' ? ' active' : ''}" id="btn-toggle-show" title="Modo Show — grid condensado">
                            <i class="fa-solid fa-table-cells"></i> Show
                        </button>
                        <span id="show-cols-picker" style="display:${_state.viewMode === 'show' ? 'inline-flex' : 'none'};align-items:center;gap:3px;margin-left:2px;" title="Número de colunas no modo Show">
                            ${['S','N','2','3','4','5'].map(v => `<button class="col-pick-btn${_state.showColumns === v ? ' active' : ''}" data-cols="${v}">${v}</button>`).join('')}
                        </span>
                        <button class="btn btn-secondary" id="btn-manage-setlists">
                            <i class="fa-solid fa-folder-open"></i> Setlists
                        </button>
                        <button class="btn btn-secondary" id="btn-funcoes">
                            <i class="fa-solid fa-ellipsis-vertical"></i> Funções
                        </button>
                        <!-- hidden file input for CSV import (triggered from funções modal) -->
                        <input type="file" id="input-import-csv" accept=".csv,.txt" style="display:none;" />
                        <button class="btn btn-primary${window.HMSOffline && window.HMSOffline.isOffline() ? ' disabled' : ''}" id="btn-new-song"
                            ${window.HMSOffline && window.HMSOffline.isOffline() ? 'disabled title="Sem conexão — edições indisponíveis"' : ''}>
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

                <!-- Search block -->
                <div class="search-block mb-2">
                    <div class="search-bar">
                        <input type="text" id="song-search" class="form-input"
                            placeholder="Buscar…"
                            value="${esc(_state.searchQuery)}" />
                        <button class="btn btn-icon" id="btn-search-clear"
                            title="Limpar busca"
                            style="${_state.searchQuery ? '' : 'display:none'}">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                        <button class="btn btn-secondary" id="btn-search" title="Buscar">
                            <i class="fa-solid fa-magnifying-glass"></i>
                        </button>
                    </div>
                    <div style="text-align:right;font-size:.75rem;color:var(--text-muted);margin-top:4px;" id="song-count"></div>
                </div>

                <!-- Filter bar -->
                <div class="filter-bar mb-2" id="filter-bar">
                    <span class="filter-label">Flag:</span>
                    <button class="filter-pill${_state.filterFlag === null ? ' active' : ''}" data-filter="flag" data-val="null" title="Todas">·</button>
                    <button class="filter-pill sf-1${_state.filterFlag === 1 ? ' active' : ''}" data-filter="flag" data-val="1" title="Verde"><i class="fa-solid fa-flag"></i></button>
                    <button class="filter-pill sf-2${_state.filterFlag === 2 ? ' active' : ''}" data-filter="flag" data-val="2" title="Amarela"><i class="fa-solid fa-flag"></i></button>
                    <button class="filter-pill sf-3${_state.filterFlag === 3 ? ' active' : ''}" data-filter="flag" data-val="3" title="Vermelha"><i class="fa-solid fa-flag"></i></button>
                    <button class="filter-pill sf-4${_state.filterFlag === 4 ? ' active' : ''}" data-filter="flag" data-val="4" title="Azul"><i class="fa-solid fa-flag"></i></button>
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
                    <span id="show-flow-picker" style="display:${_state.viewMode === 'show' ? 'inline-flex' : 'none'};align-items:center;gap:3px;margin-left:6px;border-left:1px solid var(--glass-border);padding-left:6px;" title="Direção de leitura">
                        <button class="sort-btn show-flow-btn${_state.showFlow === 'row' ? ' active' : ''}" data-flow="row" title="Sequência por linha (→)">
                            <i class="fa-solid fa-arrow-right"></i>
                        </button>
                        <button class="sort-btn show-flow-btn${_state.showFlow === 'col' ? ' active' : ''}" data-flow="col" title="Sequência por coluna (↓)">
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>
                        <button class="sort-btn show-drag-toggle${_state.showDragMode ? ' active' : ''}" id="btn-show-drag" title="Reordenar arrastando (apenas setlist com Posição)" style="margin-left:2px;">
                            <i class="fa-solid fa-grip"></i>
                        </button>
                        <button class="sort-btn" id="btn-save-prefs" title="Salvar vista atual como padrão de entrada" style="margin-left:2px;">
                            <i class="fa-solid fa-bookmark"></i>
                        </button>
                        <button class="btn btn-primary btn-sm" id="btn-save-order"
                            style="display:${_state.showDragMode && _hasUnsavedOrder ? 'inline-flex' : 'none'};align-items:center;gap:5px;padding:3px 10px;font-size:.75rem;margin-left:4px;"
                            title="Salvar nova ordem das músicas">
                            <i class="fa-solid fa-floppy-disk"></i> Salvar Ordem
                        </button>
                    </span>
                </div>

                </div><!-- /rep-controls -->

                <!-- Song list -->
                <div id="song-list">
                    <div class="content-loader">
                        <div class="loader-spinner"></div>
                        <p>Carregando músicas…</p>
                    </div>
                </div>

                <!-- Offline banner -->
                <div id="offline-banner" style="display:none;margin-top:8px;padding:10px 14px;
                     background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);
                     border-radius:8px;font-size:.82rem;color:#fca5a5;display:flex;
                     align-items:center;gap:8px;">
                    <i class="fa-solid fa-wifi" style="opacity:.6;"></i>
                    Modo offline — apenas leitura. Edite as músicas quando estiver online.
                </div>
            `;

            document.getElementById('btn-collapse-header').addEventListener('click', () => {
                _state.headerCollapsed = !_state.headerCollapsed;
                const controls = document.getElementById('rep-controls');
                const btn      = document.getElementById('btn-collapse-header');
                const sub      = document.querySelector('.page-title p');
                const actions  = document.querySelector('.page-actions');
                controls.style.display = _state.headerCollapsed ? 'none' : '';
                if (sub)     sub.style.display     = _state.headerCollapsed ? 'none' : '';
                if (actions) actions.style.display  = _state.headerCollapsed ? 'none' : '';
                btn.querySelector('i').className = `fa-solid fa-chevron-${_state.headerCollapsed ? 'down' : 'up'}`;
                btn.title = _state.headerCollapsed ? 'Expandir controles' : 'Minimizar controles';
            });

            // Key filter clicks in the header (always visible, even when collapsed)
            document.getElementById('key-filter-header')?.addEventListener('click', (e) => {
                const keyBtn = e.target.closest('.key-filter-btn[data-key]');
                if (!keyBtn) return;
                const key = keyBtn.dataset.key;
                _state.filterKey = _state.filterKey === key ? null : key;
                RepertoireComponent._renderSortToolbar();
                RepertoireComponent._renderSongList();
            });

            document.getElementById('btn-toggle-show').addEventListener('click', () => {
                _state.viewMode = _state.viewMode === 'show' ? 'list' : 'show';
                document.getElementById('btn-toggle-show').classList.toggle('active', _state.viewMode === 'show');
                const picker     = document.getElementById('show-cols-picker');
                const flowPicker = document.getElementById('show-flow-picker');
                if (picker)     picker.style.display     = _state.viewMode === 'show' ? 'inline-flex' : 'none';
                if (flowPicker) flowPicker.style.display = _state.viewMode === 'show' ? 'inline-flex' : 'none';
                RepertoireComponent._renderSongList();
            });

            document.getElementById('show-cols-picker')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.col-pick-btn');
                if (!btn) return;
                _state.showColumns = btn.dataset.cols;
                document.querySelectorAll('.col-pick-btn').forEach(b =>
                    b.classList.toggle('active', b.dataset.cols === _state.showColumns));
                if (_state.viewMode === 'show') RepertoireComponent._renderSongList();
            });

            document.getElementById('sort-toolbar')?.addEventListener('click', (e) => {
                const flowBtn = e.target.closest('.show-flow-btn');
                if (flowBtn) {
                    _state.showFlow = flowBtn.dataset.flow;
                    document.querySelectorAll('.show-flow-btn').forEach(b =>
                        b.classList.toggle('active', b.dataset.flow === _state.showFlow));
                    if (_state.viewMode === 'show') RepertoireComponent._renderSongList();
                    return;
                }
                const dragBtn = e.target.closest('#btn-show-drag');
                if (dragBtn) {
                    _state.showDragMode = !_state.showDragMode;
                    dragBtn.classList.toggle('active', _state.showDragMode);
                    if (!_state.showDragMode) {
                        if (_hasUnsavedOrder) {
                            // Há mudanças não salvas — descarta recarregando do banco
                            _originalPositions = {};
                            _hasUnsavedOrder   = false;
                            RepertoireComponent._loadSongs();
                        } else {
                            // Tudo já salvo — só re-renderiza sem buscar no banco
                            // (evita sobrescrever o estado em memória correto)
                            _originalPositions = {};
                            RepertoireComponent._renderSongList();
                        }
                    } else {
                        if (_state.viewMode === 'show') RepertoireComponent._renderSongList();
                    }
                    return;
                }
                const saveBtn = e.target.closest('#btn-save-order');
                if (saveBtn) {
                    RepertoireComponent._savePositions();
                }
                const savePrefsBtn = e.target.closest('#btn-save-prefs');
                if (savePrefsBtn) {
                    RepertoireComponent._savePrefs();
                }
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

            document.getElementById('btn-funcoes').addEventListener('click', () => {
                RepertoireComponent._openFuncoesModal();
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

            // Sort & Key Filter buttons
            document.getElementById('sort-toolbar').addEventListener('click', (e) => {
                const sortBtn = e.target.closest('.sort-btn[data-sort]');
                if (sortBtn && !sortBtn.disabled) {
                    const field = sortBtn.dataset.sort;
                    if (_state.sortBy === field) {
                        _state.sortDir = _state.sortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        _state.sortBy  = field;
                        _state.sortDir = 'asc';
                    }
                    RepertoireComponent._renderSortToolbar();
                    RepertoireComponent._renderSongList();
                    return;
                }

                const keyBtn = e.target.closest('.key-filter-btn[data-key]');
                if (keyBtn) {
                    const key = keyBtn.dataset.key;
                    _state.filterKey = _state.filterKey === key ? null : key;
                    RepertoireComponent._renderSortToolbar();
                    RepertoireComponent._renderSongList();
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

                // Se setlist ativa, mostra as top-5 posições carregadas do banco
                if (_state.activeSetlist) {
                    const withPos = _state.songs
                        .filter(s => s._position !== null && s._position !== undefined)
                        .sort((a, b) => a._position - b._position);
                    withPos.forEach((s, i) => { s._rank = i + 1; });
                    const needsNormalization = withPos.some((s, i) => s._position !== i + 1);
                    if (needsNormalization) {
                        withPos.forEach((s, i) => { s._position = i + 1; });
                        Promise.all(
                            withPos.map(s =>
                                window.HMSAPI.Setlists.updateSongPosition(_state.activeSetlist, s.id, s._position)
                            )
                        ).catch(err => console.warn('[HMS] position normalize failed:', err.message));
                    }
                }

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
            toolbar.querySelectorAll('.sort-btn[data-sort]').forEach(btn => {
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

            // Dynamic Key Filters — header slot only (sort-toolbar no longer has them)
            const uniqueKeys = [...new Set(_state.songs.map(s => s.original_key).filter(Boolean))];
            if (uniqueKeys.length === 0) {
                _state.filterKey = null;
            } else {
                if (_state.filterKey !== null && !uniqueKeys.includes(_state.filterKey)) {
                    _state.filterKey = null;
                }
                const standardOrder = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'];
                uniqueKeys.sort((a, b) => {
                    const idxA = standardOrder.indexOf(a);
                    const idxB = standardOrder.indexOf(b);
                    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }

            const headerKeyEl = document.getElementById('key-filter-header');
            if (headerKeyEl) {
                headerKeyEl.innerHTML = uniqueKeys.map(k => {
                    const isActive = _state.filterKey === k;
                    return `<button class="sort-btn key-filter-btn${isActive ? ' active' : ''}" data-key="${k}" style="padding: 3px 8px; font-size: 0.72rem; min-width: 28px; text-align: center; justify-content: center;">${k}</button>`;
                }).join('');
            }
        },

        _renderSongList: function () {
            const el = document.getElementById('song-list');
            if (!el) return;

            // Offline banner visibility
            const isOffline = window.HMSOffline && window.HMSOffline.isOffline();
            const banner = document.getElementById('offline-banner');
            if (banner) banner.style.display = isOffline ? 'flex' : 'none';

            // Client-side filter
            const filtered = _state.songs.filter(s => {
                if (_state.filterFlag  !== null && (s.status_flag || 0) !== _state.filterFlag) return false;
                if (_state.filterHarm  !== null && !!(s.harmony_str && s.harmony_str.trim()) !== _state.filterHarm) return false;
                if (_state.filterLetra !== null && !!s.has_lyrics !== _state.filterLetra) return false;
                if (_state.filterLink  !== null && !!s.audio_url  !== _state.filterLink)  return false;
                if (_state.filterKey   !== null && s.original_key !== _state.filterKey) return false;
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

            const countEl = document.getElementById('song-count');
            if (countEl) countEl.textContent = `${sorted.length} música${sorted.length !== 1 ? 's' : ''}`;

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
                const isGridDrag = _state.showDragMode && !!_state.activeSetlist;
                // byPosition: always sorted by _position so the drag badge shows
                // the correct sequential rank (1..N) even when display sort is alphabetical.
                const byPosition = [...filtered]
                    .filter(s => s._position !== null && s._position !== undefined)
                    .sort((a, b) => a._position - b._position);
                el.innerHTML = RepertoireComponent._renderShowGrid(sorted, byPosition);

                el.querySelectorAll('.show-cell').forEach(cell => {
                    // Alert toggle button always works
                    cell.querySelector('.show-alert-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        RepertoireComponent._handleToggleAlert(cell.dataset.id);
                    });
                    // Click opens detail only when NOT in drag mode
                    if (!isGridDrag) {
                        cell.addEventListener('click', (e) => {
                            if (e.target.closest('.show-alert-btn')) return;
                            const song = _state.songs.find(s => s.id === cell.dataset.id);
                            if (song) RepertoireComponent._openShowDetail(song);
                        });
                    }
                });
                if (isGridDrag) {
                    RepertoireComponent._bindShowGridDrag(el);
                } else if (_state.sortBy === 'position' && !!_state.activeSetlist) {
                    RepertoireComponent._bindDragDrop(el, sorted);
                }
                return;
            }

            const isDragMode = _state.sortBy === 'position' && !!_state.activeSetlist && !!_state.showDragMode;

            const cards = sorted.map(s => {
                const hasHarmony = !!(s.harmony_str && s.harmony_str.trim());
                const hasLyrics  = !!s.has_lyrics;
                const hasAudio   = !!s.audio_url;
                const sf         = s.status_flag || 0;
                const flagTitles = ['Marcar verde', 'Marcar amarelo', 'Marcar vermelho', 'Marcar azul', 'Remover bandeira'];
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
                        <button class="btn-icon edit${isOffline ? ' disabled' : ''}" data-action="edit" data-id="${s.id}"
                            title="${isOffline ? 'Sem conexão — edição indisponível' : 'Editar'}"
                            ${isOffline ? 'disabled' : ''}>
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-icon delete${isOffline ? ' disabled' : ''}" data-action="delete" data-id="${s.id}"
                            title="${isOffline ? 'Sem conexão — exclusão indisponível' : 'Excluir'}"
                            ${isOffline ? 'disabled' : ''}>
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

        // ── Show Grid Drag & Drop (grid reorder by position) ────
        _bindShowGridDrag: function (el) {
            const grid = el.querySelector('.show-grid');
            if (!grid) return;

            // Detect actual column count from the rendered DOM
            // (accounts for responsive CSS: 2, 4 or 5 cols depending on viewport)
            const getNumCols = () => {
                const cells = [...grid.querySelectorAll('.show-cell')];
                if (cells.length < 2) return 1;
                const firstTop = cells[0].getBoundingClientRect().top;
                return cells.filter(c => Math.abs(c.getBoundingClientRect().top - firstTop) < 4).length;
            };
            let _dragId = null;

            grid.querySelectorAll('.show-cell').forEach(cell => {
                cell.addEventListener('dragstart', e => {
                    _dragId = cell.dataset.id;
                    cell.style.opacity = '0.4';
                    e.dataTransfer.effectAllowed = 'move';
                });
                cell.addEventListener('dragend', () => {
                    cell.style.opacity = '';
                    grid.querySelectorAll('.show-cell').forEach(c => c.style.outline = '');
                });
                cell.addEventListener('dragover', e => {
                    e.preventDefault();
                    if (cell.dataset.id !== _dragId) {
                        grid.querySelectorAll('.show-cell').forEach(c => c.style.outline = '');
                        cell.style.outline = '2px solid var(--brand)';
                    }
                });
                cell.addEventListener('dragleave', () => { cell.style.outline = ''; });
                cell.addEventListener('drop', e => {
                    e.preventDefault();
                    grid.querySelectorAll('.show-cell').forEach(c => c.style.outline = '');
                    const targetId = cell.dataset.id;
                    if (!_dragId || _dragId === targetId) return;

                    // Always operate in READING ORDER (sorted by _position).
                    const setlistSongs = [..._state.songs]
                        .filter(s => s._position !== null && s._position !== undefined)
                        .sort((a, b) => a._position - b._position);

                    const fromIdx = setlistSongs.findIndex(s => s.id === _dragId);
                    const toIdx   = setlistSongs.findIndex(s => s.id === targetId);
                    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

                    // Snapshot original positions BEFORE any mutation (first drag only).
                    // _hasUnsavedOrder is false on the very first drag of a session.
                    if (!_hasUnsavedOrder) {
                        _originalPositions = {};
                        setlistSongs.forEach(s => { _originalPositions[s.id] = s._position; });
                    }

                    // Remove dragged song and insert at the correct position.
                    // • Backward drag (fromIdx > toIdx): insert AT target's index.
                    // • Forward drag (fromIdx < toIdx): insert one slot before target.
                    const [movedSong] = setlistSongs.splice(fromIdx, 1);
                    const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
                    setlistSongs.splice(insertAt, 0, movedSong);

                    // Assign sequential positions 1, 2, 3… and sync _rank (used for badge display)
                    setlistSongs.forEach((s, i) => { s._position = i + 1; s._rank = i + 1; });

                    // Mark unsaved and show the save button (sempre reseta o texto)
                    _hasUnsavedOrder = true;
                    const saveBtn = document.getElementById('btn-save-order');
                    if (saveBtn) {
                        saveBtn.style.display = 'inline-flex';
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Ordem';
                    }

                    // Re-render only (no DB write — user must click "Salvar Ordem")
                    RepertoireComponent._renderSongList();
                });
            });
        },

        // ── Show Grid ─────────────────────────────────────────────
        // sorted:     songs in current display order (may be alphabetical, key, etc.)
        // byPosition: songs sorted strictly by _position (used only for badge index)
        _renderShowGrid: function (sorted, byPosition) {
            const isDragMode = (_state.sortBy === 'position' && !!_state.activeSetlist) || _state.showDragMode;

            // ── Column-first reorder ──────────────────────────────
            // When showFlow === 'col', we need to distribute items top-to-bottom
            // per column, then read left-to-right. To achieve this with a normal
            // CSS grid (row-major), we re-sort the array so that item at visual
            // position [row][col] comes before [row][col+1].
            let displayList = sorted;
            if (_state.showFlow === 'col' && sorted.length > 0) {
                // Determine number of columns from CSS class (mirrors show-grid CSS)
                const colMap = { S: 1, '2': 2, '3': 3, '4': 4, '5': 5 };
                let numCols;
                if (_state.showColumns === 'N') {
                    // 'N' = responsive — must match CSS media queries:
                    // ≥768px → 5 cols, <768px → 2 cols
                    numCols = window.innerWidth >= 768 ? 5 : 2;
                } else {
                    numCols = colMap[_state.showColumns] || 5;
                }
                const n       = sorted.length;
                const numRows = Math.ceil(n / numCols);
                // The CSS grid places items in row-major order.
                // To achieve column-first READING, we iterate rows (outer) then cols (inner)
                // but read the source in column-major: srcIdx = col * numRows + row.
                //
                // Example with n=10, numCols=5, numRows=2:
                //   display[0,0]=src[0], display[0,1]=src[2], display[0,2]=src[4], display[0,3]=src[6], display[0,4]=src[8]
                //   display[1,0]=src[1], display[1,1]=src[3], display[1,2]=src[5], display[1,3]=src[7], display[1,4]=src[9]
                // → reading top-to-bottom in col 0: 0,1; col 1: 2,3; col 2: 4,5; etc. ✓
                const colMajor = [];
                for (let row = 0; row < numRows; row++) {
                    for (let col = 0; col < numCols; col++) {
                        const srcIdx = col * numRows + row;
                        // Push null for missing cells so CSS grid keeps correct column alignment.
                        // Without this, a short last column shifts subsequent items leftward.
                        colMajor.push(srcIdx < n ? sorted[srcIdx] : null);
                    }
                }
                displayList = colMajor;
            }

            const isShowDrag = _state.showDragMode && !!_state.activeSetlist;
            const cells = displayList.map(s => {
                // Null = empty placeholder cell (keeps CSS grid column alignment in col-flow mode)
                if (!s) return '<div class="show-cell show-cell-empty" aria-hidden="true"></div>';
                const hasHarmony = !!(s.harmony_str && s.harmony_str.trim());
                const hasLyrics  = !!s.has_lyrics;
                const sf         = s.status_flag || 0;
                const rowCls     = sf ? 'status-flag-' + sf : (hasHarmony ? 'status-ok' : 'status-warn');
                const keyCls     = (!hasHarmony && !hasLyrics) ? ' key-urgent' : '';
                return `<div class="show-cell ${rowCls}${isShowDrag ? ' draggable-cell' : ''}" data-id="${s.id}"
                    ${isDragMode ? 'draggable="true"' : ''}>
                    <span class="show-key${keyCls}" data-key="${esc(s.original_key || '')}">${esc(s.original_key || '?')}</span>
                    <span class="show-title">${esc(s.title)}</span>
                    ${isShowDrag && s._rank !== undefined
                        ? `<span class="show-pos">(${s._rank})</span>`
                        : ''}
                    <button class="show-alert-btn sf-${sf}" title="Ciclar bandeira">
                        <i class="fa-solid fa-flag"></i>
                    </button>
                </div>`;
            }).join('');
            const colClass = _state.showColumns !== 'N' ? ` cols-${_state.showColumns}` : '';
            return `<div class="show-grid${colClass}">${cells}</div>`;
        },

        _openShowDetail: function (song) {
            const origKey  = song.original_key || 'C';
            const isMinor  = origKey.endsWith('m');
            const root     = origKey.replace(/m$/, '');
            // Normalize standalone (X/) shorthand (e.g. "(3/)" = "3rd degree + repeat") → "3 /"
            // Negative lookbehind ensures we don't touch SEC_DOM targets like 25(4/)
            const harmNorm = (song.harmony_str || '').replace(/(?<![b#0-9mMho7/])\((\S+?)\/\)/g, '$1 /');
            const tokens   = window.HarmonyEngine.translate(harmNorm, root, isMinor);

            const SD_KEYS = window.HarmonyEngine.allKeys();
            const keyOptionsHtml = SD_KEYS.map(k =>
                `<option value="${k.value}"${k.value === origKey ? ' selected' : ''}>${k.label}</option>`
            ).join('');

            // Harm Func: render raw DB string as chips.
            // Delegates to the centralised HarmonyEngine.renderFuncHtml() so that
            // $label with spaces$, !mod!, SEC_DOM, SECTION, etc. are all handled
            // in one place with no duplication.
            function buildFuncHtml(str) {
                return window.HarmonyEngine.renderFuncHtml(str, esc);
            }

            // Harm Acor: render translated tokens as chips
            function buildChordsHtml(toks) {
                if (!toks.length) return `<span style="color:var(--text-muted);font-size:.85rem;">Sem harmonia cadastrada.</span>`;
                const out = [];
                let i = 0;
                let chordIdx = 0; // índice sequencial de cada posição de acorde/barra
                const sep = `<span style="opacity:.35;font-size:.7em;margin:0 3px;">·</span>`;
                while (i < toks.length) {
                    const t = toks[i];
                    if (t.type === 'STRUCT' && t.value === '[') {
                        // Collect tokens until ] → individual clickable spans, each with own idx
                        const group = [];
                        i++;
                        while (i < toks.length && !(toks[i].type === 'STRUCT' && toks[i].value === ']')) {
                            group.push(toks[i]);
                            i++;
                        }
                        i++; // skip ]
                        if (group.length) {
                            const inner = group.map(g => `<span class="sd-chord" data-chord="${esc(g.value || '')}" data-chord-idx="${chordIdx++}">${esc(g.value || '')}</span>`).join(sep);
                            out.push(`<span class="sd-chord-group">${inner}</span>`);
                        }
                        continue;
                    }
                    if (t.type === 'LABEL')
                        out.push(`<span class="sd-label">${esc(t.value)}</span>`);
                    else if (t.type === 'STRUCT')
                        out.push(t.value === '/' ? `<span class="sd-chord" data-chord="/" data-chord-idx="${chordIdx++}">/</span>` : `<span class="sd-sep">${esc(t.value) || '·'}</span>`);
                    else if (t.type === 'MOD')
                        out.push(`<span class="sd-mod">${esc('!' + t.value + '!')}</span>`);
                    else
                        out.push(`<span class="sd-chord" data-chord="${esc(t.value || '')}" data-chord-idx="${chordIdx++}">${esc(t.value || '')}</span>`);
                    i++;
                }
                return out.join('');
            }
            // ── Preferência do usuário ─────────────────────────────────
            const _pref       = localStorage.getItem('hms_show_pref') || 'acor';
            const _defaultTab = (_pref === 'func') ? 'func'
                              : (_pref === 'acor') ? 'acor' : 'letra';

            const _sfClass = (song.status_flag && song.status_flag > 0) ? ` song-flag-${song.status_flag}` : '';
            window.HMSApp.openModal(`
                <div class="sd-modal${_sfClass}">
                    <div class="sd-header" style="padding:8px 14px;align-items:center;gap:8px;">
                        <div style="min-width:0;flex:1;overflow:hidden;">
                            <div class="sd-title" style="font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(song.title)}</div>
                            <div class="sd-sub" style="font-size:.68rem;margin-top:1px;">${esc([song.artist, song.genre].filter(Boolean).join(' · '))}</div>
                        </div>
                        <div class="sd-header-tabs">
                            <button class="sd-tab${_defaultTab === 'func' ? ' active' : ''}" data-tab="func">Harm Func</button>
                            <button class="sd-tab${_defaultTab === 'acor' ? ' active' : ''}" data-tab="acor">Harm Acor</button>
                            <button class="sd-tab${_defaultTab === 'letra' ? ' active' : ''}" data-tab="letra">Letra</button>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                            <span class="song-key-badge" style="font-size:.85rem;">${esc(origKey)}</span>
                            <button id="sd-harmony-btn" title="Editor de Harmonia"
                                style="width:28px;height:28px;background:var(--brand);color:#fff;border-radius:8px;font-weight:800;font-size:.78rem;border:none;cursor:pointer;flex-shrink:0;transition:opacity .15s;"
                                onmouseenter="this.style.opacity='.8'" onmouseleave="this.style.opacity='1'">H</button>
                            <button id="sd-edit-btn" class="btn-icon edit" title="Editar música" style="width:28px;height:28px;">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="modal-close" id="sd-close-btn"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                    <div class="sd-body">
                        ${song.audio_url ? `
                        <div id="sd-audio-wrap" style="padding:0 0 8px;${_defaultTab === 'letra' ? 'display:none;' : ''}">
                            <audio id="sd-audio" controls preload="none"
                                   style="width:100%;height:34px;display:block;"></audio>
                        </div>` : ''}
                        <div class="sd-pane${_defaultTab === 'func' ? ' active' : ''}" id="sd-pane-func">
                            <div class="sd-chords">${buildFuncHtml(song.harmony_str)}</div>
                        </div>
                        <div class="sd-pane${_defaultTab === 'acor' ? ' active' : ''}" id="sd-pane-acor">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                                <span style="font-size:.8rem;color:var(--text-muted);">Tom:</span>
                                <select id="sd-key-select" class="form-input form-select"
                                        style="width:140px;padding:4px 8px;height:32px;">
                                    ${keyOptionsHtml}
                                </select>
                                <div style="display:flex;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden;margin-left:4px;">
                                    <button class="sd-ins-btn" data-ins="synth"
                                        style="padding:5px 10px;border:none;font-size:.75rem;font-family:var(--font-ui);font-weight:600;cursor:pointer;transition:all .15s;background:var(--brand-dim);color:var(--brand);">
                                        <i class="fa-solid fa-wave-square"></i> Synth
                                    </button>
                                    <button class="sd-ins-btn" data-ins="guitar"
                                        style="padding:5px 10px;border:none;border-left:1px solid var(--glass-border);font-size:.75rem;font-family:var(--font-ui);font-weight:600;cursor:pointer;transition:all .15s;background:transparent;color:var(--text-muted);">
                                        <i class="fa-solid fa-guitar"></i> Violão
                                    </button>
                                    <button class="sd-ins-btn" data-ins="cavaco"
                                        style="padding:5px 10px;border:none;border-left:1px solid var(--glass-border);font-size:.75rem;font-family:var(--font-ui);font-weight:600;cursor:pointer;transition:all .15s;background:transparent;color:var(--text-muted);">
                                        <i class="fa-solid fa-music"></i> Cavaco
                                    </button>
                                </div>
                                <!-- BPM + Tocar -->
                                <input type="number" id="sd-bpm" value="60" min="30" max="240"
                                    style="width:52px;height:32px;padding:4px 6px;text-align:center;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono);font-size:.8rem;outline:none;" title="BPM">
                                <button id="sd-play-btn"
                                    style="height:32px;padding:0 14px;border-radius:8px;border:none;background:var(--brand);color:#fff;font-size:.8rem;font-weight:700;font-family:var(--font-ui);cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s;flex-shrink:0;">
                                    <i class="fa-solid fa-play"></i> Tocar
                                </button>
                            </div>
                            <div class="sd-chords" id="sd-chords-display">${buildChordsHtml(tokens)}</div>
                        </div>
                        <div class="sd-pane${_defaultTab === 'letra' ? ' active' : ''}" id="sd-pane-letra">
                            <!-- Controls: Harm float + Reading mode -->
                            <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                                <button id="sd-harm-float-btn" title="Harmonia flutuante" style="
                                    display:flex;align-items:center;gap:6px;
                                    padding:5px 12px;border-radius:20px;font-size:.78rem;font-weight:600;
                                    border:1px solid var(--glass-border);cursor:pointer;
                                    background:transparent;color:var(--text-muted);transition:all .2s;
                                ">
                                    <i class="fa-solid fa-music"></i> Harm
                                </button>
                                <button id="sd-reading-mode-btn" title="Modo leitura" style="
                                    display:flex;align-items:center;gap:6px;
                                    padding:5px 12px;border-radius:20px;font-size:.78rem;font-weight:600;
                                    border:1px solid var(--glass-border);cursor:pointer;
                                    background:transparent;color:var(--text-muted);transition:all .2s;
                                ">
                                    <i class="fa-solid fa-sun"></i> Modo Leitura
                                </button>
                            </div>
                            <!-- Lyrics content (cresce) -->
                            <div id="sd-lyrics-content" style="flex:1;">
                                ${song.has_lyrics
                                    ? `<div class="content-loader" style="padding:12px;"><div class="loader-spinner" style="width:20px;height:20px;border-width:2px;"></div></div>`
                                    : `<p style="color:var(--text-muted);font-size:.85rem;">Sem letra cadastrada.</p>`}
                            </div>
                            <!-- Navega\u00e7\u00e3o: setas grandes na base -->
                            <div style="display:flex;align-items:center;gap:12px;margin-top:10px;">
                                <button id="sd-pg-up" title="P\u00e1gina anterior" style="
                                    flex:1;height:60px;border-radius:14px;font-size:1.15rem;font-weight:700;
                                    display:flex;align-items:center;justify-content:center;gap:10px;
                                    border:1px solid var(--glass-border);background:var(--glass-bg);
                                    color:var(--text-secondary);cursor:pointer;transition:all .2s;opacity:.3;
                                "><i class="fa-solid fa-chevron-up"></i> Anterior</button>
                                <span id="sd-page-counter" style="
                                    font-size:.85rem;font-weight:700;color:var(--text-muted);
                                    min-width:44px;text-align:center;white-space:nowrap;
                                ">1 / 1</span>
                                <button id="sd-pg-down" title="Pr\u00f3xima p\u00e1gina" style="
                                    flex:1;height:60px;border-radius:14px;font-size:1.15rem;font-weight:700;
                                    display:flex;align-items:center;justify-content:center;gap:10px;
                                    border:1px solid var(--glass-border);background:var(--glass-bg);
                                    color:var(--text-secondary);cursor:pointer;transition:all .2s;
                                ">Pr\u00f3xima <i class="fa-solid fa-chevron-down"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            `);

            document.getElementById('sd-harmony-btn').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent._openHarmonyModal(song);
            });

            document.getElementById('sd-edit-btn').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent.openSongModal(song.id);
            });

            document.getElementById('sd-close-btn')?.addEventListener('click', () => {
                // Para o áudio antes de fechar
                if (window.HMSAudio && window.HMSAudio.isPlaying) window.HMSAudio.stop();
                _setPlaying(false);
                window.HMSApp.closeModal();
            });

            // ── Audio: proactive resolution ─────────────────────────────
            // Priority: 1) IndexedDB blob (offline sync) 2) session cache 3) JS fetch
            // Never sets src directly from Supabase URL on mobile (wrong Content-Type).
            if (song.audio_url) {
                const audioEl = document.getElementById('sd-audio');
                if (audioEl) {
                    window._HMS_audioCache = window._HMS_audioCache || new Map();

                    const _setBlob = (blobUrl) => {
                        audioEl.src = blobUrl;
                        audioEl.load();
                        // Revoke blob on modal close (session-cache entries are kept alive)
                        const ov = document.getElementById('modal-overlay');
                        if (ov && blobUrl.startsWith('blob:')) {
                            const obs = new MutationObserver(() => {
                                if (ov.classList.contains('hidden')) {
                                    // Only revoke if not in session cache (session cache manages its own)
                                    if (!window._HMS_audioCache.has(song.id)) URL.revokeObjectURL(blobUrl);
                                    obs.disconnect();
                                }
                            });
                            obs.observe(ov, { attributes: true, attributeFilter: ['class'] });
                        }
                    };

                    const _fetchAndCache = async () => {
                        const wrap = document.getElementById('sd-audio-wrap');
                        let loader = null;
                        try {
                            // Show subtle loading text
                            if (wrap) {
                                loader = document.createElement('div');
                                loader.id = 'sd-audio-loader';
                                loader.style.cssText = 'font-size:.72rem;color:var(--text-muted);text-align:center;padding:2px 0;';
                                loader.textContent = 'Carregando \u00e1udio\u2026';
                                wrap.appendChild(loader);
                            }
                            const resp = await fetch(song.audio_url, { mode: 'cors', credentials: 'omit' });
                            if (!resp.ok) throw new Error('HTTP ' + resp.status);
                            const buf  = await resp.arrayBuffer();
                            const blob = new Blob([buf], { type: 'audio/mpeg' });
                            const blobUrl = URL.createObjectURL(blob);
                            window._HMS_audioCache.set(song.id, blobUrl);
                            _setBlob(blobUrl);
                        } catch (e) {
                            // Fetch failed — fall back to direct URL (works on desktop)
                            audioEl.src = song.audio_url;
                            console.error('[HMS] Audio fetch failed, using direct URL:', e.message);
                        } finally {
                            loader?.remove();
                        }
                    };

                    // 1. IndexedDB offline blob (highest priority — works offline)
                    if (window.HMSOfflineDB && window.HMSOfflineDB.audioBlobs) {
                        window.HMSOfflineDB.audioBlobs.get(song.id).then(async cached => {
                            if (cached && cached.blob) {
                                const objUrl = URL.createObjectURL(cached.blob);
                                _setBlob(objUrl);
                            } else if (window._HMS_audioCache.has(song.id)) {
                                // 2. Session cache
                                _setBlob(window._HMS_audioCache.get(song.id));
                            } else {
                                // 3. Fetch from network
                                await _fetchAndCache();
                            }
                        }).catch(async () => {
                            // IndexedDB unavailable — try session cache then network
                            if (window._HMS_audioCache.has(song.id)) {
                                _setBlob(window._HMS_audioCache.get(song.id));
                            } else {
                                await _fetchAndCache();
                            }
                        });
                    } else {
                        // No IndexedDB — try session cache then network
                        if (window._HMS_audioCache.has(song.id)) {
                            _setBlob(window._HMS_audioCache.get(song.id));
                        } else {
                            _fetchAndCache();
                        }
                    }
                }
            }

            document.querySelectorAll('.sd-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.sd-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.sd-pane').forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(`sd-pane-${tab.dataset.tab}`).classList.add('active');

                    // Show/hide audio player — only on harm tabs
                    const audioWrap = document.getElementById('sd-audio-wrap');
                    const isLetra = tab.dataset.tab === 'letra';
                    if (audioWrap) {
                        audioWrap.style.display = isLetra ? 'none' : '';
                        if (isLetra) document.getElementById('sd-audio')?.pause();
                    }

                    // Reading mode: harm tabs = sempre escuro; letra = segue _readingMode
                    // Isso garante que Harm Func/Acor nunca ficam brancos
                    if (_readingMode) {
                        _applyReadingMode(isLetra); // branco na letra, escuro no harm
                    }
                });
            });


            // ── Instrumento para play de acordes ─────────────────────────
            let _sdInstrument = 'synth'; // 'synth' | 'guitar' | 'cavaco'

            document.querySelectorAll('.sd-ins-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    _sdInstrument = btn.dataset.ins;
                    document.querySelectorAll('.sd-ins-btn').forEach(b => {
                        const on = b.dataset.ins === _sdInstrument;
                        b.style.background = on ? 'var(--brand-dim)' : 'transparent';
                        b.style.color      = on ? 'var(--brand)'     : 'var(--text-muted)';
                    });
                    // Rebind chord chips para o instrumento novo
                    _bindChordChips();
                });
            });

            const _bindChordChips = () => {
                document.querySelectorAll('#sd-chords-display .sd-chord').forEach(chip => {
                    // Usa data-chord se disponível (chips individuais); caso contrário usa textContent
                    const chord = chip.dataset.chord ?? chip.textContent?.trim();
                    if (!chord || chord === '/' || chord === '|') return;
                    chip.style.cursor = _sdInstrument === 'synth' ? '' : 'pointer';
                    chip.onclick = _sdInstrument === 'synth' ? null : () => {
                        window.HMSAudio.playGuitarSample(chord, _sdInstrument);
                    };
                });
            };
            _bindChordChips();

            // ── Play / Stop ──────────────────────────────────────────────
            const _sdPlayBtn = document.getElementById('sd-play-btn');
            const _sdBpmInput = document.getElementById('sd-bpm');

            const _setPlaying = (on) => {
                if (!_sdPlayBtn) return;
                _sdPlayBtn.innerHTML = on
                    ? '<i class="fa-solid fa-stop"></i> Parar'
                    : '<i class="fa-solid fa-play"></i> Tocar';
                _sdPlayBtn.style.background = on ? 'var(--danger, #e53e3e)' : 'var(--brand)';
            };

            _sdPlayBtn?.addEventListener('click', async () => {
                if (window.HMSAudio.isPlaying) {
                    window.HMSAudio.stop();
                    _setPlaying(false);
                    // Remove highlight
                    document.querySelectorAll('#sd-chords-display .sd-chord.chord-active').forEach(c => c.classList.remove('chord-active'));
                    return;
                }
                const keyVal    = document.getElementById('sd-key-select')?.value || origKey;
                const isMinor   = keyVal.endsWith('m');
                const root      = keyVal.replace(/m$/, '');
                const bpm       = parseInt(_sdBpmInput?.value, 10) || 60;
                const strumMode = _sdInstrument === 'guitar' ? 'guitar-sample'
                                : _sdInstrument === 'cavaco' ? 'cavaco-sample'
                                : 'basic';
                const toks = window.HarmonyEngine.translate(song.harmony_str || '', root, isMinor);
                _setPlaying(true);

                // Highlight callback: marca o chip do acorde atual por índice
                const onChordChange = (chordIdx, chordValue) => {
                    const allChips = document.querySelectorAll('#sd-chords-display .sd-chord');
                    allChips.forEach(c => c.classList.remove('chord-active'));
                    // Busca primeiro por índice exato
                    const byIdx = document.querySelector(`#sd-chords-display .sd-chord[data-chord-idx="${chordIdx}"]`);
                    if (byIdx) {
                        byIdx.classList.add('chord-active');
                    } else {
                        // Fallback: primeiro chip com o mesmo valor
                        const first = [...allChips].find(c => c.dataset.chord === chordValue);
                        if (first) first.classList.add('chord-active');
                    }
                };

                try {
                    await window.HMSAudio.playSequence(toks, bpm, () => {
                        _setPlaying(false);
                        document.querySelectorAll('#sd-chords-display .sd-chord.chord-active').forEach(c => c.classList.remove('chord-active'));
                    }, strumMode, onChordChange);
                } catch (err) {
                    _setPlaying(false);
                    console.warn('[Repertoire] playSequence erro:', err.message);
                }
            });

            document.getElementById('sd-key-select')?.addEventListener('change', function () {
                const newIsMinor = this.value.endsWith('m');
                const newRoot = this.value.replace(/m$/, '');
                const newTokens = window.HarmonyEngine.translate(song.harmony_str || '', newRoot, newIsMinor);
                document.getElementById('sd-chords-display').innerHTML = buildChordsHtml(newTokens);
                _bindChordChips();
            });

            // ── Reading mode toggle ────────────────────────────────
            let _readingMode = (_pref === 'letra-clara'); // inicia em modo leitura se pref for letra-clara
            const _readingBtn    = document.getElementById('sd-reading-mode-btn');
            const _lyricsPaneEl  = document.getElementById('sd-pane-letra');
            const _sdBody        = document.querySelector('.sd-body');
            const _pgUp          = document.getElementById('sd-pg-up');
            const _pgDown        = document.getElementById('sd-pg-down');
            const _counter       = document.getElementById('sd-page-counter');

            // ── 2-column paging state ──────────────────────────────
            let _currentPage = 0;
            let _totalPages  = 1;
            let _viewportEl  = null;   // div with overflow:hidden
            let _preEl       = null;   // the pre element

            const _updateCounter = () => {
                if (_counter) _counter.textContent = `${_currentPage + 1} / ${_totalPages}`;
            };

            const _updateArrows = () => {
                if (_pgUp) {
                    const dis = _currentPage <= 0;
                    _pgUp.style.opacity       = dis ? '.3' : '1';
                    _pgUp.style.pointerEvents = dis ? 'none' : 'auto';
                }
                if (_pgDown) {
                    const dis = _currentPage >= _totalPages - 1;
                    _pgDown.style.opacity       = dis ? '.3' : '1';
                    _pgDown.style.pointerEvents = dis ? 'none' : 'auto';
                }
            };

            const _goToPage = (page) => {
                if (!_preEl || !_viewportEl) return;
                _currentPage = Math.max(0, Math.min(page, _totalPages - 1));
                const vw = _viewportEl.clientWidth;
                _preEl.style.transform = `translateX(-${_currentPage * vw}px)`;
                _updateCounter();
                _updateArrows();
            };

            // Recalculate total pages.
            // Mede o próprio _preEl (já no DOM com fonte correta) em coluna única
            // na largura real de uma coluna (≈ (vw-gap)/2).
            // Clone externo falha porque a fonte pode ainda não estar aplicada.
            const _calcPages = () => {
                if (!_preEl || !_viewportEl) return;
                const vw = _viewportEl.clientWidth;
                const vh = _viewportEl.clientHeight;
                // Se pane ainda está oculto, reagendar
                if (!vw || !vh) { requestAnimationFrame(_calcPages); return; }

                const colW = Math.max(100, Math.floor((vw - 24) / 2));

                // Salvar estado
                const savedTransition  = _preEl.style.transition;
                const savedTransform   = _preEl.style.transform;
                const savedColumnCount = _preEl.style.columnCount;
                const savedHeight      = _preEl.style.height;
                const savedWidth       = _preEl.style.width;

                // Medir: coluna única na largura correta
                _preEl.style.transition   = 'none';
                _preEl.style.transform    = '';
                _preEl.style.columnCount  = '1';
                _preEl.style.height       = 'auto';
                _preEl.style.width        = colW + 'px';

                const contentH = _preEl.scrollHeight;

                // Restaurar layout 2 colunas
                _preEl.style.transition   = savedTransition;
                _preEl.style.columnCount  = savedColumnCount || '2';
                _preEl.style.height       = savedHeight      || (vh + 'px');
                _preEl.style.width        = savedWidth       || '';
                _preEl.style.transform    = '';   // voltar para página 0

                // Cada "página" = 2 colunas de altura vh
                const columnsNeeded = Math.ceil(contentH / vh);
                _totalPages  = Math.max(1, Math.ceil(columnsNeeded / 2));
                _currentPage = 0;
                _updateCounter();
                _updateArrows();
            };

            _pgUp  ?.addEventListener('click', () => _goToPage(_currentPage - 1));
            _pgDown?.addEventListener('click', () => _goToPage(_currentPage + 1));

            const _applyReadingMode = (active) => {
                // Same font/spacing in both modes — only colors change
                const isTablet = window.innerWidth >= 600;
                const fontSize = isTablet ? '1.15rem' : '.9rem';
                const lineH    = '2.0';

                const _sdModal  = document.querySelector('.sd-modal');
                const _sdHeader = _sdModal?.querySelector('.sd-header');
                const _sdTitle  = _sdModal?.querySelector('.sd-title');
                const _sdSub    = _sdModal?.querySelector('.sd-sub');
                const _sdBody   = _sdModal?.querySelector('.sd-body');
                const _keyBadge = _sdModal?.querySelector('.song-key-badge');

                if (active) {
                    // ── Pintar o modal inteiro de creme ──────────────
                    if (_sdModal)  { _sdModal.style.background  = '#faf9f4'; _sdModal.style.color = '#2d2d2d'; }
                    if (_sdHeader) { _sdHeader.style.borderBottomColor = '#ddd'; }
                    if (_sdTitle)  { _sdTitle.style.color  = '#1a1a1a'; }
                    if (_sdSub)    { _sdSub.style.color    = '#555'; }
                    if (_sdBody)   { _sdBody.style.background = '#faf9f4'; }
                    if (_keyBadge) { _keyBadge.style.background = 'rgba(0,0,0,.08)'; _keyBadge.style.color = '#333'; }

                    // ── Sem estilo na camada da letra (modal já é creme) ──
                    _lyricsPaneEl.style.background   = '';
                    _lyricsPaneEl.style.borderRadius = '';
                    _lyricsPaneEl.style.boxShadow    = '';

                    _readingBtn.style.background  = '#7c6fff';
                    _readingBtn.style.color       = '#fff';
                    _readingBtn.style.borderColor = '#7c6fff';
                    _readingBtn.innerHTML = '<i class="fa-solid fa-moon"></i> Modo Escuro';
                    if (_preEl) {
                        _preEl.style.color      = '#2d2d2d';
                        _preEl.style.fontSize   = fontSize;
                        _preEl.style.lineHeight = lineH;
                    }
                    // Nav buttons: escurecer para contraste no fundo claro
                    if (_pgUp)   { _pgUp.style.color   = '#444'; }
                    if (_pgDown) { _pgDown.style.color = '#444'; }
                    if (_counter){ _counter.style.color = '#666'; }
                } else {
                    // ── Restaurar modal escuro ────────────────────────
                    if (_sdModal)  { _sdModal.style.background  = ''; _sdModal.style.color = ''; }
                    if (_sdHeader) { _sdHeader.style.borderBottomColor = ''; }
                    if (_sdTitle)  { _sdTitle.style.color  = ''; }
                    if (_sdSub)    { _sdSub.style.color    = ''; }
                    if (_sdBody)   { _sdBody.style.background = ''; }
                    if (_keyBadge) { _keyBadge.style.background = ''; _keyBadge.style.color = ''; }

                    _readingBtn.style.background  = 'transparent';
                    _readingBtn.style.color       = 'var(--text-muted)';
                    _readingBtn.style.borderColor = 'var(--glass-border)';
                    _readingBtn.innerHTML = '<i class="fa-solid fa-sun"></i> Modo Leitura';
                    if (_preEl) {
                        _preEl.style.color      = 'var(--text-secondary)';
                        _preEl.style.fontSize   = fontSize;
                        _preEl.style.lineHeight = lineH;
                    }
                    // Nav buttons: restaurar cor padrão
                    if (_pgUp)   { _pgUp.style.color   = ''; }
                    if (_pgDown) { _pgDown.style.color = ''; }
                    if (_counter){ _counter.style.color = ''; }
                }
                // Recalculate pages after font change
                requestAnimationFrame(_calcPages);
            };


            _readingBtn?.addEventListener('click', () => {
                _readingMode = !_readingMode;
                _applyReadingMode(_readingMode);
            });

            // ── Painel flutuante de harmonia (arrastável + redimensionável) ──
            const _harmFloatBtn = document.getElementById('sd-harm-float-btn');
            _harmFloatBtn?.addEventListener('click', () => {
                // Fechar se já aberto
                const existing = document.getElementById('sd-harm-float');
                if (existing) {
                    existing.remove();
                    _harmFloatBtn.style.background  = 'transparent';
                    _harmFloatBtn.style.color       = 'var(--text-muted)';
                    _harmFloatBtn.style.borderColor = 'var(--glass-border)';
                    return;
                }

                const sdModal = document.querySelector('.sd-modal');
                if (!sdModal) return;

                // ── Restaurar geometria salva (localStorage) ──────
                const GEO_KEY = 'hms_harm_float_geo';
                let savedGeo = null;
                try { savedGeo = JSON.parse(localStorage.getItem(GEO_KEY)); } catch (_) {}

                // Posição padrão: encostado à direita do modal na tela
                const mr  = sdModal.getBoundingClientRect();
                const defLeft = Math.min(mr.right + 10, window.innerWidth - 480);
                const defTop  = Math.max(8, mr.top + 48);

                const geoLeft   = savedGeo?.left   ?? defLeft;
                const geoTop    = savedGeo?.top     ?? defTop;
                const geoWidth  = savedGeo?.width   ?? 460;
                const geoHeight = savedGeo?.height  ?? 280;

                // ── Criar painel ──────────────────────────────────
                const panel = document.createElement('div');
                panel.id = 'sd-harm-float';
                panel.style.cssText = [
                    'position:fixed',
                    'z-index:9999',
                    `top:${geoTop}px`,
                    `left:${geoLeft}px`,
                    `width:${geoWidth}px`,
                    `height:${geoHeight}px`,
                    'min-width:260px',
                    'min-height:150px',
                    'background:var(--sidebar-bg, #1a1a2e)',
                    'border:1px solid var(--glass-border)',
                    'border-radius:16px',
                    'box-shadow:0 16px 48px rgba(0,0,0,.65)',
                    'user-select:none',
                    'touch-action:none',
                    'display:flex',
                    'flex-direction:column',
                    'overflow:hidden',
                ].join(';');

                panel.innerHTML = `
                    <div id="sd-hf-handle" style="
                        display:flex;align-items:center;justify-content:space-between;
                        padding:10px 14px;background:rgba(255,255,255,.06);
                        cursor:grab;border-bottom:1px solid var(--glass-border);flex-shrink:0;
                    ">
                        <span style="font-weight:700;font-size:.82rem;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                            <i class="fa-solid fa-music" style="color:var(--brand);"></i> Acordes
                        </span>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <button id="sd-hf-save" title="Salvar posição e tamanho" style="
                                background:rgba(255,255,255,.08);border:1px solid var(--glass-border);
                                color:var(--text-muted);cursor:pointer;
                                font-size:.7rem;font-weight:800;padding:2px 7px;line-height:1.6;
                                border-radius:6px;letter-spacing:.04em;transition:all .2s;
                            ">S</button>
                            <button id="sd-hf-close" style="
                                background:transparent;border:none;color:var(--text-muted);
                                cursor:pointer;font-size:1rem;padding:2px 4px;line-height:1;
                            ">✕</button>
                        </div>
                    </div>
                    <div id="sd-hf-body" style="padding:12px;overflow-y:auto;flex:1;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                            <span style="font-size:.78rem;color:var(--text-muted);">Tom:</span>
                            <select id="sd-hf-key" class="form-input form-select"
                                    style="width:130px;padding:4px 8px;height:30px;font-size:.8rem;">
                                ${keyOptionsHtml}
                            </select>
                        </div>
                        <div class="sd-chords" id="sd-hf-chords">
                            ${buildChordsHtml(tokens)}
                        </div>
                    </div>
                    <!-- Handle de resize (canto inferior direito) -->
                    <div id="sd-hf-resize" title="Redimensionar" style="
                        position:absolute;right:0;bottom:0;
                        width:22px;height:22px;
                        cursor:se-resize;
                        display:flex;align-items:flex-end;justify-content:flex-end;
                        padding:4px;
                        border-radius:0 0 16px 0;
                        opacity:.45;
                        transition:opacity .15s;
                    " onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='.45'">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--text-muted)" stroke-width="1.6" stroke-linecap="round">
                            <line x1="2" y1="10" x2="10" y2="2"/>
                            <line x1="6" y1="10" x2="10" y2="6"/>
                        </svg>
                    </div>
                `;

                // Append ao body para poder sair do modal
                document.body.appendChild(panel);

                // Marcar botão como ativo
                _harmFloatBtn.style.background  = 'var(--brand)';
                _harmFloatBtn.style.color       = '#fff';
                _harmFloatBtn.style.borderColor = 'var(--brand)';

                // Fechar
                document.getElementById('sd-hf-close')?.addEventListener('click', () => {
                    panel.remove();
                    _harmFloatBtn.style.background  = 'transparent';
                    _harmFloatBtn.style.color       = 'var(--text-muted)';
                    _harmFloatBtn.style.borderColor = 'var(--glass-border)';
                });

                // Salvar posição + tamanho (botão S)
                document.getElementById('sd-hf-save')?.addEventListener('click', () => {
                    const rect = panel.getBoundingClientRect();
                    const geo  = {
                        left:   rect.left,
                        top:    rect.top,
                        width:  panel.offsetWidth,
                        height: panel.offsetHeight,
                    };
                    try { localStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch (_) {}

                    // Flash de confirmação no botão
                    const btn = document.getElementById('sd-hf-save');
                    if (!btn) return;
                    const prev = btn.textContent;
                    btn.textContent = '✓';
                    btn.style.color       = '#4ade80';
                    btn.style.borderColor = '#4ade80';
                    setTimeout(() => {
                        btn.textContent   = prev;
                        btn.style.color   = '';
                        btn.style.borderColor = '';
                    }, 1200);
                });

                // Sincronizar tom
                document.getElementById('sd-hf-key')?.addEventListener('change', function () {
                    const newIsMinor = this.value.endsWith('m');
                    const newRoot    = this.value.replace(/m$/, '');
                    const newToks    = window.HarmonyEngine.translate(song.harmony_str || '', newRoot, newIsMinor);
                    document.getElementById('sd-hf-chords').innerHTML = buildChordsHtml(newToks);
                    const mainSel    = document.getElementById('sd-key-select');
                    if (mainSel) { mainSel.value = this.value; }
                    const mainChords = document.getElementById('sd-chords-display');
                    if (mainChords) mainChords.innerHTML = buildChordsHtml(newToks);
                });

                // ── Drag (mouse + touch) ──────────────────────────
                const handle = document.getElementById('sd-hf-handle');
                let dragging = false, ox = 0, oy = 0, sx = 0, sy = 0;

                // ── Resize (mouse + touch) ────────────────────────
                const resizeEl = document.getElementById('sd-hf-resize');
                let resizing = false, rx = 0, ry = 0, rw = 0, rh = 0;

                const getPoint = e => e.touches ? e.touches[0] : e;

                // Drag start
                const onDragStart = e => {
                    dragging = true;
                    const pt = getPoint(e);
                    ox = pt.clientX; oy = pt.clientY;
                    const rect = panel.getBoundingClientRect();
                    sx = rect.left; sy = rect.top;
                    handle.style.cursor = 'grabbing';
                    e.preventDefault();
                };

                // Resize start
                const onResizeStart = e => {
                    resizing = true;
                    const pt = getPoint(e);
                    rx = pt.clientX; ry = pt.clientY;
                    rw = panel.offsetWidth;
                    rh = panel.offsetHeight;
                    e.preventDefault();
                    e.stopPropagation();
                };

                const onMove = e => {
                    const pt = getPoint(e);
                    if (dragging) {
                        panel.style.left = (sx + pt.clientX - ox) + 'px';
                        panel.style.top  = (sy + pt.clientY - oy) + 'px';
                        e.preventDefault();
                    }
                    if (resizing) {
                        const newW = Math.max(190, rw + pt.clientX - rx);
                        const newH = Math.max(150, rh + pt.clientY - ry);
                        panel.style.width  = newW + 'px';
                        panel.style.height = newH + 'px';
                        e.preventDefault();
                    }
                };

                const onEnd = () => {
                    dragging = false;
                    resizing = false;
                    handle.style.cursor = 'grab';
                };

                handle.addEventListener('mousedown',    onDragStart);
                handle.addEventListener('touchstart',   onDragStart,  { passive: false });
                resizeEl.addEventListener('mousedown',  onResizeStart);
                resizeEl.addEventListener('touchstart', onResizeStart, { passive: false });
                document.addEventListener('mousemove',  onMove);
                document.addEventListener('touchmove',  onMove, { passive: false });
                document.addEventListener('mouseup',    onEnd);
                document.addEventListener('touchend',   onEnd);

                // Cleanup ao fechar modal ou remover painel
                const cleanupListeners = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('touchmove', onMove);
                    document.removeEventListener('mouseup',  onEnd);
                    document.removeEventListener('touchend', onEnd);
                };
                new MutationObserver((_, obs) => {
                    if (!document.getElementById('sd-harm-float')) {
                        cleanupListeners();
                        obs.disconnect();
                    }
                }).observe(document.body, { childList: true, subtree: true });
            });

            if (song.has_lyrics) {
                window.HMSAPI.Songs.getById(song.id).then(full => {
                    const el = document.getElementById('sd-lyrics-content');
                    if (!el) return;
                    if (full.lyrics) {
                        // ── Build viewport + pre for 2-col paging ──
                        // Larger on tablet for better readability
                        const isTablet = window.innerWidth >= 600;
                        const viewportH = Math.floor(window.innerHeight * (isTablet ? 0.65 : 0.50));
                        const fontSize  = isTablet ? '1.15rem' : '.9rem';
                        const lineH     = isTablet ? '2.0' : '1.8';

                        const viewport = document.createElement('div');
                        viewport.style.cssText = [
                            'overflow:hidden',
                            `height:${viewportH}px`,
                            'position:relative',
                        ].join(';');

                        const pre = document.createElement('pre');
                        pre.id = 'sd-lyrics-pre';
                        pre.style.cssText = [
                            'white-space:pre-wrap',
                            'font-family:var(--font-ui)',
                            `font-size:${fontSize}`,
                            'color:var(--text-secondary)',
                            `line-height:${lineH}`,
                            'font-weight:600',
                            'column-count:2',
                            'column-fill:auto',
                            `height:${viewportH}px`,
                            'column-gap:24px',
                            'margin:0',
                            'transition:transform .4s ease',
                            'will-change:transform',
                        ].join(';');
                        pre.textContent = full.lyrics;

                        viewport.appendChild(pre);
                        el.innerHTML = '';
                        el.appendChild(viewport);

                        _viewportEl = viewport;
                        _preEl      = pre;

                        // Aguardar fonte + duplo rAF para layout e fonte garantidos
                        document.fonts.ready.then(() => {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    _calcPages();
                                    if (_readingMode) _applyReadingMode(true);
                                });
                            });
                        });
                    } else {
                        el.innerHTML = `<p style="color:var(--text-muted);font-size:.85rem;">Letra n\u00e3o encontrada.</p>`;
                    }
                }).catch(() => {});
            }
        },

        // ── Harmony Editor Modal ──────────────────────────────────
        _openHarmonyModal: async function (song) {
            // Load full song data to get harmony_str_old
            let fullSong = song;
            try {
                window.HMSApp.showLoading();
                fullSong = await window.HMSAPI.Songs.getById(song.id);
            } catch (_) { /* use original song object */ }
            finally { window.HMSApp.hideLoading(); }

            const origKey  = fullSong.original_key || 'C';
            const isMinor  = origKey.endsWith('m');
            const root     = origKey.replace(/m$/, '');
            const SD_KEYS  = window.HarmonyEngine.allKeys();
            const esc      = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

            const keyOptionsHtml = SD_KEYS.map(k =>
                `<option value="${k.value}"${k.value === origKey ? ' selected' : ''}>${k.label}</option>`
            ).join('');

            // ── Shared helpers (mirrors _openShowDetail) ────────────
            // Delegates to the centralised HarmonyEngine.renderFuncHtml().
            function buildFuncHtml(str) {
                return window.HarmonyEngine.renderFuncHtml(str, esc);
            }

            function buildChordsHtml(toks) {
                if (!toks || !toks.length) return `<span style="color:var(--text-muted);font-size:.85rem;">Sem harmonia.</span>`;
                const out = []; let i = 0;
                const sep = `<span style="opacity:.35;font-size:.7em;margin:0 3px;">·</span>`;
                while (i < toks.length) {
                    const t = toks[i];
                    if (t.type === 'STRUCT' && t.value === '[') {
                        const group = []; i++;
                        while (i < toks.length && !(toks[i].type === 'STRUCT' && toks[i].value === ']')) { group.push(toks[i]); i++; }
                        i++;
                        if (group.length) out.push(`<span class="sd-chord">${group.map(g => `<span>${esc(g.value||'')}</span>`).join(sep)}</span>`);
                        continue;
                    }
                    if (t.type === 'LABEL')       out.push(`<span class="sd-label">${esc(t.value)}</span>`);
                    else if (t.type === 'STRUCT')  out.push(t.value==='/' ? `<span class="sd-chord">/</span>` : `<span class="sd-sep">${esc(t.value)||'·'}</span>`);
                    else if (t.type === 'MOD')     out.push(`<span class="sd-mod">${esc('!'+t.value+'!')}</span>`);
                    else                           out.push(`<span class="sd-chord">${esc(t.value||'')}</span>`);
                    i++;
                }
                return out.join('');
            }

            const sectionStyle = 'border:1px solid var(--glass-border);border-radius:12px;padding:14px;background:var(--glass-bg);margin-bottom:12px;';
            const headerStyle  = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;flex-wrap:wrap;';
            const labelStyle   = 'font-size:.8rem;font-weight:700;color:var(--text-secondary);display:flex;align-items:center;gap:6px;';

            window.HMSApp.openModal(`
                <div class="sd-modal">
                    <div class="sd-header" style="padding:8px 14px;align-items:center;gap:8px;">
                        <div style="min-width:0;flex:1;overflow:hidden;">
                            <div class="sd-title" style="font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(fullSong.title)}</div>
                            <div class="sd-sub" style="font-size:.68rem;margin-top:1px;">${esc([fullSong.artist, fullSong.genre].filter(Boolean).join(' · '))} &mdash; <span style="color:var(--brand);">Editor de Harmonia</span></div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                            <button id="hm-back-btn" class="btn btn-secondary btn-sm" style="font-size:.75rem;padding:4px 10px;">
                                <i class="fa-solid fa-arrow-left"></i> Voltar
                            </button>
                            <button class="modal-close" id="hm-close-btn"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>

                    <div class="sd-body" style="overflow-y:auto;display:flex;flex-direction:column;gap:4px;">

                        <!-- ── Seção 1: Harmonia Funcional (editável) ── -->
                        <div style="${sectionStyle}">
                            <div style="${headerStyle}">
                                <span style="${labelStyle}"><i class="fa-solid fa-pen-to-square" style="color:var(--brand);"></i> Harmonia Funcional</span>
                                <div style="display:flex;gap:8px;">
                                    <button id="hm-analyze-func" class="btn btn-secondary btn-sm">
                                        <i class="fa-solid fa-magnifying-glass-chart"></i> Analisar
                                    </button>
                                    <button id="hm-save-func" class="btn btn-primary btn-sm">
                                        <i class="fa-solid fa-floppy-disk"></i> Salvar
                                    </button>
                                </div>
                            </div>
                            <textarea id="hm-func-textarea" class="form-input" rows="4"
                                style="font-family:var(--font-mono);font-size:.88rem;resize:vertical;"
                                placeholder="Graus funcionais (ex: 1m 4m 2h 5 1m)…">${esc(fullSong.harmony_str || '')}</textarea>
                            <div id="hm-func-preview" class="sd-chords" style="min-height:24px;margin-top:10px;"></div>
                        </div>

                        <!-- ── Seção 2: Harmonia Funcional Antiga (read-only) ── -->
                        <div style="${sectionStyle}opacity:${fullSong.harmony_str_old ? '1' : '.6'};">
                            <div style="${headerStyle}">
                                <span style="${labelStyle}"><i class="fa-solid fa-clock-rotate-left" style="color:var(--text-muted);"></i> Harmonia Funcional Antiga <span style="font-size:.7rem;font-weight:400;color:var(--text-muted);">(somente leitura)</span></span>
                                ${fullSong.harmony_str_old ? `<button id="hm-restore-btn" class="btn btn-secondary btn-sm" title="Copiar para o campo editável">
                                    <i class="fa-solid fa-rotate-left"></i> Restaurar
                                </button>` : ''}
                            </div>
                            <div class="sd-chords" style="min-height:24px;">${buildFuncHtml(fullSong.harmony_str_old)}</div>
                        </div>

                        <!-- ── Seção 3: Draft de Acordes ── -->
                        <div style="${sectionStyle}">
                            <div style="${headerStyle}">
                                <span style="${labelStyle}"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--chord-amber);"></i> Draft de Acordes</span>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <select id="hm-draft-key" class="form-input form-select"
                                        style="width:130px;height:30px;padding:2px 8px;font-size:.78rem;">${keyOptionsHtml}</select>
                                    <button id="hm-analyze-draft" class="btn btn-primary btn-sm">
                                        <i class="fa-solid fa-magnifying-glass-chart"></i> Analisar
                                    </button>
                                </div>
                            </div>
                            <textarea id="hm-draft-textarea" class="form-input" rows="3"
                                style="font-family:var(--font-mono);font-size:.88rem;resize:vertical;"
                                placeholder="Cole acordes aqui (ex: Dm Gm C7 F Am E7)…"></textarea>
                            <div id="hm-draft-result" style="margin-top:8px;"></div>
                        </div>

                    </div>
                </div>
            `);

            // ── Back button ──
            document.getElementById('hm-back-btn')?.addEventListener('click', () => {
                window.HMSApp.closeModal();
                // Re-open detail with potentially updated song
                const updated = _state.songs.find(s => s.id === fullSong.id) || fullSong;
                RepertoireComponent._openShowDetail(updated);
            });
            document.getElementById('hm-close-btn')?.addEventListener('click', () => window.HMSApp.closeModal());

            // ── Seção 1: Analisar funcional → acordes ──
            document.getElementById('hm-analyze-func').addEventListener('click', () => {
                const str = document.getElementById('hm-func-textarea').value.trim();
                if (!str) { window.HMSApp.showToast('Escreva a harmonia funcional primeiro.', 'warning'); return; }
                const harmNorm = str.replace(/(?<![b#0-9mMho7/])\((\S+?)\/\)/g, '$1 /');
                const tokens = window.HarmonyEngine.translate(harmNorm, root, isMinor);

                // Build chord string for draft.
                // • CHORD tokens → acorde real (ex: "Am", "G7")
                // • STRUCT '/'  → mantém barra de repetição
                // • LABEL tokens → restaura como $texto$ (preserva anotações de seção)
                // • MOD, '[', ']', '×N' → ignorados
                const chordWords = tokens
                    .filter(t => t.type !== 'MOD')
                    .map(t => {
                        if (t.type === 'LABEL') return `$${t.value}$`;
                        const v = t.value || '';
                        if (v === '[' || v === ']') return null;
                        // Filter out ×N repeat markers (STRUCT value like "×2")
                        if (t.type === 'STRUCT' && /^×\d+$/.test(v)) return null;
                        return v || null;
                    })
                    .filter(v => v !== null && v !== '')
                    .join(' ');

                const previewDiv = document.getElementById('hm-func-preview');
                previewDiv.innerHTML = buildChordsHtml(tokens) +
                    `<div style="margin-top:8px;text-align:right;">
                        <button id="hm-to-draft-btn" class="btn btn-secondary btn-sm">
                            <i class="fa-solid fa-arrow-down"></i> Usar no Draft de Acordes
                        </button>
                    </div>`;

                document.getElementById('hm-to-draft-btn').addEventListener('click', () => {
                    document.getElementById('hm-draft-textarea').value = chordWords;
                    // Set the draft key selector to the song's original key
                    const draftKey = document.getElementById('hm-draft-key');
                    if (draftKey) draftKey.value = origKey;
                    document.getElementById('hm-draft-result').innerHTML = '';
                    window.HMSApp.showToast('Acordes enviados para o Draft. Clique em Analisar para converter em graus.', 'info');
                    document.getElementById('hm-draft-textarea').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            });

            // ── Seção 1: Salvar ──
            document.getElementById('hm-save-func').addEventListener('click', async () => {
                const newHarmony = document.getElementById('hm-func-textarea').value.trim();
                const btn = document.getElementById('hm-save-func');
                btn.disabled = true;
                btn.innerHTML = '<span class="btn-spinner"></span> Salvando…';
                try {
                    await window.HMSAPI.Songs.update(fullSong.id, { harmony_str: newHarmony });
                    // Update in-memory state
                    fullSong.harmony_str = newHarmony;
                    const inState = _state.songs.find(s => s.id === fullSong.id);
                    if (inState) inState.harmony_str = newHarmony;
                    window.HMSApp.showToast('Harmonia funcional salva!', 'success');
                } catch (err) {
                    window.HMSApp.showToast('Erro ao salvar: ' + err.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
                }
            });

            // ── Seção 2: Restaurar antigo → Seção 1 ──
            document.getElementById('hm-restore-btn')?.addEventListener('click', () => {
                document.getElementById('hm-func-textarea').value = fullSong.harmony_str_old || '';
                document.getElementById('hm-func-preview').innerHTML = '';
                window.HMSApp.showToast('Harmonia antiga copiada para o campo editável.', 'info');
            });

            // ── Seção 3: Analisar acordes → graus funcionais ──
            document.getElementById('hm-analyze-draft').addEventListener('click', () => {
                const chordsStr = document.getElementById('hm-draft-textarea').value.trim();
                if (!chordsStr) { window.HMSApp.showToast('Escreva os acordes primeiro.', 'warning'); return; }
                const keyVal  = document.getElementById('hm-draft-key').value;
                const kObj    = SD_KEYS.find(k => k.value === keyVal) || SD_KEYS[0];
                const kRoot   = kObj.value.replace(/m$/, '');
                const kMinor  = kObj.isMinor;
                const degrees = window.HarmonyEngine.analyze(chordsStr, kRoot, kMinor) || '';

                document.getElementById('hm-draft-result').innerHTML = `
                    <div style="background:var(--bg-deep);border-radius:10px;padding:10px 14px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
                            <span style="font-size:.78rem;color:var(--text-muted);">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Graus funcionais (tom: ${esc(keyVal)})
                            </span>
                            <button id="hm-use-draft" class="btn btn-secondary btn-sm">
                                <i class="fa-solid fa-arrow-up"></i> Usar no Funcional
                            </button>
                        </div>
                        <div style="font-family:var(--font-mono);font-size:1.1rem;color:var(--chord-amber);word-break:break-all;">${esc(degrees)}</div>
                    </div>
                `;
                document.getElementById('hm-use-draft')?.addEventListener('click', () => {
                    document.getElementById('hm-func-textarea').value = degrees;
                    document.getElementById('hm-func-preview').innerHTML = '';
                    window.HMSApp.showToast('Graus copiados para Harmonia Funcional. Salve quando estiver pronto.', 'info');
                    document.getElementById('hm-func-textarea').focus();
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
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <input type="url" id="sf-audio-url" class="form-input" style="flex:1;"
                                        placeholder="https://…/musica.mp3"
                                        value="${esc(song?.audio_url || '')}" />
                                    <button type="button" id="btn-upload-audio-inline" title="Fazer upload de MP3 para o Supabase Storage"
                                        style="flex-shrink:0;padding:0 14px;height:38px;border-radius:8px;border:1px solid var(--glass-border);
                                        background:var(--glass-bg);color:var(--text-secondary);cursor:pointer;
                                        display:flex;align-items:center;gap:6px;font-size:.82rem;white-space:nowrap;
                                        transition:background .15s,color .15s;">
                                        <i class="fa-solid fa-upload"></i> Upload
                                    </button>
                                    <input type="file" id="sf-audio-file-input" accept=".mp3,.m4a,.ogg,.wav,.aac,audio/*" style="display:none;">
                                </div>
                                <span class="form-hint">Cole um link direto ou clique em Upload para enviar o arquivo para o Supabase Storage.</span>
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

            // ── Inline audio upload ───────────────────────────────────
            const _uploadBtn  = document.getElementById('btn-upload-audio-inline');
            const _fileInput  = document.getElementById('sf-audio-file-input');
            const _urlInput   = document.getElementById('sf-audio-url');

            _uploadBtn.addEventListener('click', () => _fileInput.click());

            _fileInput.addEventListener('change', async () => {
                const file = _fileInput.files[0];
                if (!file) return;

                // Feedback: spinner
                _uploadBtn.disabled = true;
                _uploadBtn.innerHTML = '<span class="btn-spinner" style="width:13px;height:13px;border-width:2px;"></span> Enviando…';

                try {
                    const { error } = await window.supabaseClient.storage
                        .from('songs-audio')
                        .upload(file.name, file, { contentType: file.type || 'audio/mpeg', upsert: true });
                    if (error) throw error;

                    const { data: urlData } = window.supabaseClient.storage
                        .from('songs-audio').getPublicUrl(file.name);
                    const publicUrl = urlData?.publicUrl;

                    if (publicUrl) {
                        _urlInput.value = publicUrl;
                        _uploadBtn.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Enviado';
                        window.HMSApp.showToast(`"${file.name}" enviado com sucesso!`, 'success');
                    }
                } catch (err) {
                    _uploadBtn.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i> Erro';
                    window.HMSApp.showToast('Erro no upload: ' + err.message, 'error');
                } finally {
                    _uploadBtn.disabled = false;
                    // Reset button after 3s
                    setTimeout(() => {
                        _uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload';
                    }, 3000);
                }
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

            // Track which sources were tried for the final toast
            const tried = [];

            try {
                let lyrics = null;

                // ── 1. Musixmatch via Edge Function (server-side, sem CORS) ─
                tried.push('Musixmatch');
                setStatus('Musixmatch…');
                try {
                    const edgeUrl =
                        `https://knwpgznnipufvwobgrzf.supabase.co/functions/v1/musixmatch-proxy` +
                        `?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
                    const res = await fetch(edgeUrl, { signal: AbortSignal.timeout(12000) });
                    if (res.ok) {
                        const data = await res.json();
                        lyrics = data.lyrics || null;
                    }
                } catch { /* edge function unavailable, continue */ }

                if (lyrics) {
                    document.getElementById('sf-lyrics').value = lyrics.trim();
                    window.HMSApp.showToast('Letra encontrada via Musixmatch! ✓', 'success');
                    return;
                }

                // ── 2. lyrics.ovh (free, no key, CORS ok) ────────────────
                tried.push('lyrics.ovh');
                setStatus('lyrics.ovh…');
                try {
                    const res = await fetch(
                        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
                        { signal: AbortSignal.timeout(9000) }
                    );
                    if (res.ok) {
                        const data = await res.json();
                        lyrics = data.lyrics ? data.lyrics.trim() : null;
                    }
                } catch { /* network error, continue */ }

                // Fallback: try with "Grupo " prefix for Brazilian artists
                if (!lyrics && !artist.startsWith('Grupo ')) {
                    try {
                        const res = await fetch(
                            `https://api.lyrics.ovh/v1/${encodeURIComponent('Grupo ' + artist)}/${encodeURIComponent(title)}`,
                            { signal: AbortSignal.timeout(9000) }
                        );
                        if (res.ok) {
                            const data = await res.json();
                            lyrics = data.lyrics ? data.lyrics.trim() : null;
                        }
                    } catch { /* network error, continue */ }
                }

                if (lyrics) {
                    document.getElementById('sf-lyrics').value = lyrics;
                    window.HMSApp.showToast('Letra encontrada via lyrics.ovh! ✓', 'success');
                    return;
                }

                // ── 2. lrclib.net (free, no key, CORS ok) ─────────────────
                tried.push('lrclib');
                setStatus('lrclib…');

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
                    if (!lyrics && !artist.startsWith('Grupo ')) {
                        lyrics = await _lrclibFetch('Grupo ' + artist);
                    }
                } catch { /* network error, continue */ }

                if (lyrics) {
                    document.getElementById('sf-lyrics').value = lyrics.trim();
                    window.HMSApp.showToast('Letra encontrada via lrclib.net! ✓', 'success');
                    return;
                }

                // ── 3. Vagalume (requires VAGALUME_KEY) ───────────────────
                if (VAGALUME_KEY) {
                    tried.push('Vagalume');
                    setStatus('Vagalume…');
                    try {
                        const res = await fetch(
                            `https://api.vagalume.com.br/search.php?art=${encodeURIComponent(artist)}&mus=${encodeURIComponent(title)}&apikey=${VAGALUME_KEY}`,
                            { signal: AbortSignal.timeout(9000) }
                        );
                        if (res.ok) {
                            const data = await res.json();
                            lyrics = data.mus?.[0]?.text || null;
                        }
                    } catch { /* network error */ }

                    if (lyrics) {
                        document.getElementById('sf-lyrics').value = lyrics.trim();
                        window.HMSApp.showToast('Letra encontrada via Vagalume! ✓', 'success');
                        return;
                    }
                }

                // ── Nenhuma fonte encontrou ────────────────────────────────
                const triedStr = tried.map(s => `${s}: ✗`).join('  ');
                window.HMSApp.showToast(`Letra não encontrada. ${triedStr}`, 'warning');

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
                    <div style="display:flex;gap:6px;">
                        <button class="btn-icon sl-copy-btn" data-id="${sl.id}" title="Copiar setlist" style="color:var(--brand);">
                            <i class="fa-regular fa-clone"></i>
                        </button>
                        <button class="btn-icon delete sl-delete-btn" data-id="${sl.id}" title="Excluir setlist">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        },

        // ── Funções Modal ─────────────────────────────────────────
        _openFuncoesModal: async function () {
            const lastSyncLabel = await window.HMSSyncManager.getLastSyncLabel();
            const stats         = await window.HMSSyncManager.getStats();
            const statsLabel    = stats.songCount
                ? `${stats.songCount} m\u00fasica${stats.songCount !== 1 ? 's' : ''} \u00b7 ${stats.setlistCount} setlist${stats.setlistCount !== 1 ? 's' : ''}`
                : 'Nenhuma sync realizada';

            const lastAudioSyncLabel = await window.HMSSyncManager.getLastAudioSyncLabel();
            const audioStats         = await window.HMSSyncManager.getAudioStats();
            const audioStatsLabel    = audioStats.count
                ? `${audioStats.count} arquivo${audioStats.count !== 1 ? 's' : ''} \u00b7 ${window.HMSSyncManager.formatBytes(audioStats.totalBytes)}`
                : 'Nenhum MP3 em cache';

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-ellipsis-vertical"></i> Fun\u00e7\u00f5es</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;padding:16px;">

                    <!-- Sync para Show -->
                    <div style="background:rgba(124,111,255,.10);border:1px solid rgba(124,111,255,.25);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <div>
                                <div style="font-weight:600;font-size:.95rem;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
                                    <i class="fa-solid fa-tower-broadcast" style="color:#7c6fff;"></i> Sync para Show
                                </div>
                                <div style="font-size:.75rem;color:var(--text-muted);margin-top:3px;">
                                    \u00daltima: ${lastSyncLabel}
                                </div>
                                <div style="font-size:.75rem;color:var(--text-muted);">${statsLabel}</div>
                            </div>
                            <button class="btn btn-primary" id="fm-sync-show" style="white-space:nowrap;flex-shrink:0;">
                                <i class="fa-solid fa-arrow-rotate-right"></i> Sincronizar
                            </button>
                        </div>
                        <!-- Progress bar (hidden by default) -->
                        <div id="sync-progress-wrap" style="display:none;flex-direction:column;gap:6px;">
                            <div style="background:rgba(255,255,255,.08);border-radius:99px;height:6px;overflow:hidden;">
                                <div id="sync-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#7c6fff,#a78bfa);border-radius:99px;transition:width .3s ease;"></div>
                            </div>
                            <div id="sync-progress-msg" style="font-size:.75rem;color:var(--text-muted);text-align:center;"></div>
                        </div>
                    </div>

                    <!-- Sync de MP3 -->
                    <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.22);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <div>
                                <div style="font-weight:600;font-size:.95rem;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
                                    <i class="fa-solid fa-file-audio" style="color:#10b981;"></i> Sync de MP3
                                </div>
                                <div style="font-size:.75rem;color:var(--text-muted);margin-top:3px;">
                                    \u00daltima: ${lastAudioSyncLabel}
                                </div>
                                <div style="font-size:.75rem;color:var(--text-muted);" id="fm-audio-stats-label">${audioStatsLabel}</div>
                            </div>
                            <button class="btn btn-sm" id="fm-sync-audio" style="white-space:nowrap;flex-shrink:0;background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.4);color:#34d399;">
                                <i class="fa-solid fa-arrow-rotate-right"></i> Sincronizar
                            </button>
                        </div>
                        <!-- Progress bar MP3 (hidden by default) -->
                        <div id="audio-sync-progress-wrap" style="display:none;flex-direction:column;gap:6px;">
                            <div style="background:rgba(255,255,255,.08);border-radius:99px;height:6px;overflow:hidden;">
                                <div id="audio-sync-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:99px;transition:width .3s ease;"></div>
                            </div>
                            <div id="audio-sync-progress-msg" style="font-size:.75rem;color:var(--text-muted);text-align:center;"></div>
                        </div>
                        <div style="font-size:.68rem;color:var(--text-muted);text-align:right;">
                            <span id="fm-clear-audio-cache" style="cursor:pointer;text-decoration:underline;opacity:.6;" title="Limpar todos os MP3s em cache">Limpar cache</span>
                        </div>
                    </div>

                    <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:0;">

                    <!-- Simular offline toggle -->
                    <div id="fm-force-offline-row" style="display:flex;align-items:center;justify-content:space-between;
                         padding:10px 14px;border-radius:8px;cursor:pointer;
                         background:${window.HMSOffline._forceOffline ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.04)'};
                         border:1px solid ${window.HMSOffline._forceOffline ? 'rgba(239,68,68,.3)' : 'rgba(255,255,255,.07)'};
                         transition:background .2s,border .2s;">
                        <div>
                            <div style="font-size:.88rem;font-weight:500;color:var(--text-primary);display:flex;align-items:center;gap:7px;">
                                <i class="fa-solid fa-flask" style="font-size:.8rem;color:${window.HMSOffline._forceOffline ? '#fca5a5' : 'var(--text-muted)'};" id="fm-force-icon"></i>
                                <span id="fm-force-label">${window.HMSOffline._forceOffline ? 'Desativar modo offline (teste)' : 'Simular modo offline (teste)'}</span>
                            </div>
                            <div style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">Testa sem precisar desconectar o WiFi</div>
                        </div>
                        <div style="width:38px;height:22px;border-radius:99px;position:relative;
                             background:${window.HMSOffline._forceOffline ? '#ef4444' : 'rgba(255,255,255,.15)'};
                             transition:background .25s;flex-shrink:0;" id="fm-force-track">
                            <div style="width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;
                                 top:3px;transition:left .25s;
                                 left:${window.HMSOffline._forceOffline ? '19px' : '3px'};" id="fm-force-thumb"></div>
                        </div>
                    </div>

                    <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:0;">

                    <button class="btn btn-secondary funcoes-btn" id="fm-import-csv" style="justify-content:flex-start;gap:10px;">
                        <i class="fa-solid fa-file-import" style="width:18px;text-align:center;"></i> Importar CSV
                    </button>
                    <button class="btn btn-secondary funcoes-btn" id="fm-bulk-lyrics" style="justify-content:flex-start;gap:10px;">
                        <i class="fa-solid fa-wand-magic-sparkles" style="width:18px;text-align:center;"></i> Buscar Letras
                    </button>
                    <button class="btn btn-secondary funcoes-btn" id="fm-refine-lyrics" style="justify-content:flex-start;gap:10px;">
                        <i class="fa-solid fa-pen-to-square" style="width:18px;text-align:center;"></i> Refinar Letras
                    </button>
                    <button class="btn btn-secondary funcoes-btn" id="fm-bulk-hygiene" style="justify-content:flex-start;gap:10px;">
                        <i class="fa-solid fa-broom" style="width:18px;text-align:center;"></i> Higienizar Harmonias
                    </button>
                    <button class="btn btn-secondary funcoes-btn" id="fm-upload-audio" style="justify-content:flex-start;gap:10px;">
                        <i class="fa-solid fa-upload" style="width:18px;text-align:center;"></i> Upload MP3
                    </button>
                    <button class="btn btn-secondary funcoes-btn" id="fm-link-audio" style="justify-content:flex-start;gap:10px;">
                        <i class="fa-solid fa-link" style="width:18px;text-align:center;"></i> Vincular \u00c1udio
                    </button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);

            // ── Simular offline toggle ────────────────────────────────
            document.getElementById('fm-force-offline-row').addEventListener('click', () => {
                const next = !window.HMSOffline._forceOffline;
                window.HMSOffline.setForce(next);

                // Update toggle visuals without closing modal
                const row   = document.getElementById('fm-force-offline-row');
                const track = document.getElementById('fm-force-track');
                const thumb = document.getElementById('fm-force-thumb');
                const label = document.getElementById('fm-force-label');
                const icon  = document.getElementById('fm-force-icon');
                row.style.background   = next ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.04)';
                row.style.borderColor  = next ? 'rgba(239,68,68,.3)'  : 'rgba(255,255,255,.07)';
                track.style.background = next ? '#ef4444' : 'rgba(255,255,255,.15)';
                thumb.style.left       = next ? '19px' : '3px';
                label.textContent      = next ? 'Desativar modo offline (teste)' : 'Simular modo offline (teste)';
                icon.style.color       = next ? '#fca5a5' : 'var(--text-muted)';
            });

            // ── Sync button ──────────────────────────────────────────
            document.getElementById('fm-sync-show').addEventListener('click', async () => {
                const syncBtn  = document.getElementById('fm-sync-show');
                const wrapEl   = document.getElementById('sync-progress-wrap');
                const barEl    = document.getElementById('sync-progress-bar');
                const msgEl    = document.getElementById('sync-progress-msg');

                syncBtn.disabled = true;
                syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando\u2026';
                wrapEl.style.display = 'flex';

                try {
                    const result = await window.HMSSyncManager.sync((step, total, message) => {
                        const pct = Math.round((step / total) * 100);
                        barEl.style.width = pct + '%';
                        msgEl.textContent = message;
                    });

                    barEl.style.width = '100%';
                    msgEl.textContent = `\u2713 ${result.songs} m\u00fasicas e ${result.setlists} setlists sincronizados`;
                    syncBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Conclu\u00eddo';
                    window.HMSApp.showToast(`Sync completo: ${result.songs} m\u00fasicas salvas offline`, 'success');
                } catch (err) {
                    msgEl.textContent = 'Erro: ' + (err.message || 'falha na sync');
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Tentar novamente';
                    window.HMSApp.showToast('Erro na sincroniza\u00e7\u00e3o: ' + err.message, 'error');
                }
            });

            // ── Audio Sync button ────────────────────────────────────
            document.getElementById('fm-sync-audio').addEventListener('click', async () => {
                const syncBtn = document.getElementById('fm-sync-audio');
                const wrapEl  = document.getElementById('audio-sync-progress-wrap');
                const barEl   = document.getElementById('audio-sync-progress-bar');
                const msgEl   = document.getElementById('audio-sync-progress-msg');

                syncBtn.disabled = true;
                syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Baixando\u2026';
                wrapEl.style.display = 'flex';

                // Use songs already loaded in state; fallback to IndexedDB if offline
                let songs = _state.songs.length ? _state.songs : await window.HMSOfflineDB.songs.getAll();

                try {
                    const result = await window.HMSSyncManager.syncAudio(songs, (idx, total, title, stats) => {
                        if (total === 0) { msgEl.textContent = 'Nenhuma música com áudio.'; return; }
                        const pct = Math.round((idx / total) * 100);
                        barEl.style.width = pct + '%';
                        const s = stats || {};
                        msgEl.textContent = total > 0
                            ? `(${idx}/${total}) ${title || ''}  \u2193${s.downloaded||0} \u21BA${s.skipped||0} \u2717${s.errors||0}`
                            : title;
                    });

                    barEl.style.width = '100%';
                    const msg = result.total === 0
                        ? 'Nenhuma música com áudio'
                        : `\u2713 ${result.downloaded} baixado${result.downloaded!==1?'s':''}  \u21BA ${result.skipped} j\u00e1 em cache  \u2717 ${result.errors} erro${result.errors!==1?'s':''}`;
                    msgEl.textContent = msg;
                    syncBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Conclu\u00eddo';

                    // Update the stats label below the card
                    const newAudioStats = await window.HMSSyncManager.getAudioStats();
                    const statsEl = document.getElementById('fm-audio-stats-label');
                    if (statsEl) {
                        statsEl.textContent = newAudioStats.count
                            ? `${newAudioStats.count} arquivo${newAudioStats.count!==1?'s':''} \u00b7 ${window.HMSSyncManager.formatBytes(newAudioStats.totalBytes)}`
                            : 'Nenhum MP3 em cache';
                    }

                    if (result.total > 0) {
                        window.HMSApp.showToast(`MP3 sync: ${result.downloaded} baixado${result.downloaded!==1?'s':''}, ${result.skipped} em cache`, 'success');
                    }
                } catch (err) {
                    msgEl.textContent = 'Erro: ' + (err.message || 'falha na sync');
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Tentar novamente';
                    window.HMSApp.showToast('Erro no sync de MP3: ' + err.message, 'error');
                }
            });

            // ── Clear audio cache link ───────────────────────────────
            document.getElementById('fm-clear-audio-cache').addEventListener('click', async () => {
                if (!confirm('Apagar todos os MP3s em cache? Você precisará fazer o sync novamente para usar offline.')) return;
                try {
                    await window.HMSSyncManager.clearAudioCache();
                    const statsEl = document.getElementById('fm-audio-stats-label');
                    if (statsEl) statsEl.textContent = 'Nenhum MP3 em cache';
                    window.HMSApp.showToast('Cache de MP3 limpo.', 'info');
                } catch (err) {
                    window.HMSApp.showToast('Erro ao limpar cache: ' + err.message, 'error');
                }
            });

            document.getElementById('fm-import-csv').addEventListener('click', () => {
                window.HMSApp.closeModal();
                document.getElementById('input-import-csv').click();
            });
            document.getElementById('fm-bulk-lyrics').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent._bulkFetchLyrics();
            });
            document.getElementById('fm-refine-lyrics').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent._refineLyrics();
            });
            document.getElementById('fm-bulk-hygiene').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent._bulkHygienize();
            });
            document.getElementById('fm-upload-audio').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent._uploadAudioModal();
            });
            document.getElementById('fm-link-audio').addEventListener('click', () => {
                window.HMSApp.closeModal();
                RepertoireComponent._bulkLinkAudio();
            });
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

        // ── Refinar Letras ─────────────────────────────────────────
        _refineLyrics: function () {
            const songs = _state.songs.filter(s => !s.has_lyrics);
            const EDGE_URL = 'https://knwpgznnipufvwobgrzf.supabase.co/functions/v1/musixmatch-proxy';

            const rowsHtml = songs.length === 0
                ? `<p style="color:var(--text-muted);text-align:center;padding:24px 0;">Todas as músicas já têm letra! 🎉</p>`
                : songs.map((s, idx) => `
                    <div class="rl-row" id="rl-row-${idx}" data-id="${s.id}" style="
                        background:var(--glass-bg);
                        border:1px solid var(--glass-border);
                        border-radius:10px;
                        padding:12px 14px;
                        margin-bottom:10px;
                        display:grid;
                        grid-template-columns:1fr 1fr;
                        gap:8px;
                    ">
                        <!-- Linha 1: título + artista -->
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:.72rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;">TÍTULO</label>
                            <input id="rl-title-${idx}" class="form-input" value="${(s.title||'').replace(/"/g,'&quot;')}" style="height:32px;font-size:.85rem;">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:.72rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;">INTÉRPRETE</label>
                            <input id="rl-artist-${idx}" class="form-input" value="${(s.artist||'').replace(/"/g,'&quot;')}" style="height:32px;font-size:.85rem;">
                        </div>
                        <!-- Linha 2: letra (span 2) -->
                        <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px;">
                            <label style="font-size:.72rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;">LETRA</label>
                            <textarea id="rl-lyrics-${idx}" class="form-input" rows="4" style="font-size:.8rem;resize:vertical;min-height:80px;">${(s.lyrics||'').replace(/</g,'&lt;')}</textarea>
                        </div>
                        <!-- Linha 3: botões -->
                        <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;">
                            <button class="btn btn-secondary rl-mm-btn" data-idx="${idx}" style="font-size:.78rem;padding:5px 12px;height:30px;">
                                <i class="fa-solid fa-music"></i> MM
                            </button>
                            <button class="btn btn-secondary rl-letras-btn" data-idx="${idx}" style="font-size:.78rem;padding:5px 12px;height:30px;">
                                <i class="fa-solid fa-globe"></i> Letras
                            </button>
                            <button class="btn btn-primary rl-save-btn" data-idx="${idx}" style="font-size:.78rem;padding:5px 14px;height:30px;">
                                <i class="fa-solid fa-floppy-disk"></i> Salvar
                            </button>
                        </div>
                    </div>`).join('');

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-pen-to-square"></i> Refinar Letras</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="max-height:70vh;overflow-y:auto;padding-right:4px;">
                    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px;">
                        <strong style="color:var(--text-primary);">${songs.length}</strong> músicas sem letra.
                        Edite título/intérprete/letra e salve linha a linha.
                        <strong>MM</strong> busca no Musixmatch · <strong>Letras</strong> abre letras.mus.br.
                    </p>
                    <div id="rl-list">${rowsHtml}</div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                </div>
            `, { wide: true });

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            const listEl = document.getElementById('rl-list');

            // ── Botão MM: busca Musixmatch com título/artista do input ──
            listEl.addEventListener('click', async (e) => {
                const mmBtn     = e.target.closest('.rl-mm-btn');
                const letrasBtn = e.target.closest('.rl-letras-btn');
                const saveBtn   = e.target.closest('.rl-save-btn');

                if (mmBtn) {
                    const idx    = mmBtn.dataset.idx;
                    const artist = document.getElementById(`rl-artist-${idx}`).value.trim();
                    const title  = document.getElementById(`rl-title-${idx}`).value.trim();
                    if (!artist || !title) { window.HMSApp.showToast('Preencha título e intérprete.', 'warning'); return; }

                    mmBtn.disabled = true;
                    mmBtn.innerHTML = '<span class="btn-spinner"></span>';

                    // Tenta artista normal, depois com prefixo "Grupo"
                    const tryFetch = async (a) => {
                        try {
                            const res = await fetch(`${EDGE_URL}?artist=${encodeURIComponent(a)}&title=${encodeURIComponent(title)}`,
                                { signal: AbortSignal.timeout(12000) });
                            if (!res.ok) return null;
                            const data = await res.json();
                            return data.lyrics || null;
                        } catch { return null; }
                    };

                    let lyrics = await tryFetch(artist);
                    if (!lyrics && !artist.startsWith('Grupo ')) lyrics = await tryFetch('Grupo ' + artist);

                    mmBtn.disabled = false;
                    mmBtn.innerHTML = '<i class="fa-solid fa-music"></i> MM';

                    if (lyrics) {
                        document.getElementById(`rl-lyrics-${idx}`).value = lyrics.trim();
                        window.HMSApp.showToast('Letra encontrada! Confira e salve.', 'success');
                    } else {
                        window.HMSApp.showToast('Musixmatch não encontrou esta música.', 'warning');
                    }
                }

                if (letrasBtn) {
                    const idx    = letrasBtn.dataset.idx;
                    const artist = document.getElementById(`rl-artist-${idx}`).value.trim();
                    const title  = document.getElementById(`rl-title-${idx}`).value.trim();

                    // Converte para slug no formato do letras.mus.br
                    // ex: "Zeca Pagodinho" + "Camarão que dorme" → /zeca-pagodinho/camarao-que-dorme/
                    const toSlug = (str) => str
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')   // remove acentos
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, '')      // remove especiais
                        .trim()
                        .replace(/\s+/g, '-');             // espaço → hífen

                    const artistSlug = toSlug(artist);
                    const titleSlug  = toSlug(title);
                    window.open(`https://www.letras.mus.br/${artistSlug}/${titleSlug}/`, '_blank');
                }

                if (saveBtn) {
                    const idx    = saveBtn.dataset.idx;
                    const rowEl  = document.getElementById(`rl-row-${idx}`);
                    const songId = rowEl.dataset.id;
                    const title  = document.getElementById(`rl-title-${idx}`).value.trim();
                    const artist = document.getElementById(`rl-artist-${idx}`).value.trim();
                    const lyrics = document.getElementById(`rl-lyrics-${idx}`).value.trim();

                    if (!title) { window.HMSApp.showToast('Título não pode ser vazio.', 'warning'); return; }

                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="btn-spinner"></span>';

                    try {
                        const payload = { title, artist };
                        if (lyrics) payload.lyrics = lyrics;
                        await window.HMSAPI.Songs.update(songId, payload);

                        // Remove a linha da lista se letra foi salva
                        if (lyrics) {
                            rowEl.style.transition = 'opacity .3s';
                            rowEl.style.opacity = '0';
                            setTimeout(() => rowEl.remove(), 300);
                            window.HMSApp.showToast(`"${title}" salvo!`, 'success');
                        } else {
                            saveBtn.disabled = false;
                            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
                            window.HMSApp.showToast(`"${title}" atualizado (sem letra ainda).`, 'info');
                        }
                        await RepertoireComponent._loadSongs();
                    } catch (err) {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
                        window.HMSApp.showToast('Erro ao salvar: ' + err.message, 'error');
                    }
                }
            });
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
                        Fonte: <strong>Musixmatch</strong> (1ª tentativa), <strong>Musixmatch + "Grupo"</strong> (2ª), <strong>lrclib.net</strong> (3ª). Delay de 400ms entre buscas.
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

            const EDGE_URL = 'https://knwpgznnipufvwobgrzf.supabase.co/functions/v1/musixmatch-proxy';

            // Busca via Musixmatch Edge Function (server-side, sem CORS)
            const musixmatchFetch = async (artistName, title) => {
                try {
                    const res = await fetch(
                        `${EDGE_URL}?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(title)}`,
                        { signal: AbortSignal.timeout(12000) }
                    );
                    if (!res.ok) return null;
                    const data = await res.json();
                    return data.lyrics || null;
                } catch { return null; }
            };

            // Busca via lrclib.net (free, sem key)
            const lrclibFetch = async (artistName, title) => {
                try {
                    const res = await fetch(
                        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artistName)}&track_name=${encodeURIComponent(title)}`,
                        { signal: AbortSignal.timeout(9000) }
                    );
                    if (!res.ok) return null;
                    const data = await res.json();
                    return data.plainLyrics || data.syncedLyrics || null;
                } catch { return null; }
            };

            const addLog = (msg) => {
                logEl.textContent += msg + '\n';
                logEl.scrollTop = logEl.scrollHeight;
            };

            let found = 0, notFound = 0;
            const total = songs.length;

            for (let i = 0; i < songs.length; i++) {
                const s      = songs[i];
                const artist = (s.artist || '').trim();
                const title  = (s.title  || '').trim();
                const pct    = Math.round((i / total) * 100);
                barEl.style.width    = pct + '%';
                statusEl.textContent = `${i + 1} / ${total} — ${title}`;

                let lyrics = null;
                let source = '';

                // 1ª tentativa: Musixmatch (artista normal)
                lyrics = await musixmatchFetch(artist, title);
                if (lyrics) { source = 'Musixmatch'; }

                // 2ª tentativa: Musixmatch com prefixo "Grupo "
                if (!lyrics && artist && !artist.startsWith('Grupo ')) {
                    lyrics = await musixmatchFetch('Grupo ' + artist, title);
                    if (lyrics) { source = 'Musixmatch+Grupo'; }
                }

                // 3ª tentativa: lrclib (artista normal)
                if (!lyrics) {
                    lyrics = await lrclibFetch(artist, title);
                    if (lyrics) { source = 'lrclib'; }
                }

                // 4ª tentativa: lrclib com prefixo "Grupo "
                if (!lyrics && artist && !artist.startsWith('Grupo ')) {
                    lyrics = await lrclibFetch('Grupo ' + artist, title);
                    if (lyrics) { source = 'lrclib+Grupo'; }
                }

                if (lyrics) {
                    try {
                        await window.HMSAPI.Songs.update(s.id, { lyrics: lyrics.trim() });
                        found++;
                        addLog(`✓ [${source}] ${title} — ${artist}`);
                    } catch (err) {
                        addLog(`✗ Erro ao salvar "${title}": ${err.message}`);
                    }
                } else {
                    notFound++;
                    addLog(`– Não encontrado: ${title} — ${artist}`);
                }

                // Rate limiting: 400ms entre requests (respeita limite da API)
                if (i < songs.length - 1) await new Promise(r => setTimeout(r, 400));
            }

            barEl.style.width = '100%';
            statusEl.textContent = `Concluído: ${found} letras encontradas, ${notFound} não encontradas.`;
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Fechar';
            window.HMSApp.showToast(`${found} letras salvas!`, 'success');
            await RepertoireComponent._loadSongs();
        },

        // ── Upload Audio to Storage ───────────────────────────────
        _uploadAudioModal: function () {
            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-upload"></i> Upload MP3 → Supabase Storage</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <div id="upload-drop-zone" style="
                        border:2px dashed var(--line-color);border-radius:10px;
                        padding:28px 16px;text-align:center;cursor:pointer;
                        transition:border-color .2s,background .2s;margin-bottom:12px;">
                        <i class="fa-solid fa-file-audio" style="font-size:2rem;color:var(--text-muted);display:block;margin-bottom:8px;"></i>
                        <p style="color:var(--text-muted);font-size:.875rem;margin:0 0 8px;">
                            Arraste arquivos aqui ou clique para selecionar
                        </p>
                        <span style="font-size:.75rem;color:var(--text-muted);">MP3, M4A, OGG, WAV, AAC</span>
                        <input type="file" id="upload-file-input" multiple
                            accept=".mp3,.m4a,.ogg,.wav,.aac,audio/*"
                            style="display:none;" />
                    </div>
                    <div id="upload-file-list" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                    <button class="btn btn-primary" id="btn-start-upload" disabled>
                        <i class="fa-solid fa-upload"></i> Enviar
                    </button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            const dropZone  = document.getElementById('upload-drop-zone');
            const fileInput = document.getElementById('upload-file-input');
            const fileList  = document.getElementById('upload-file-list');
            const startBtn  = document.getElementById('btn-start-upload');
            let selectedFiles = [];

            function renderFileList() {
                fileList.innerHTML = selectedFiles.map((f, i) => `
                    <div id="upload-item-${i}" style="
                        display:flex;align-items:center;gap:10px;
                        background:var(--glass-bg);border:1px solid var(--glass-border);
                        border-radius:8px;padding:8px 12px;">
                        <i class="fa-solid fa-file-audio" style="color:var(--text-muted);flex-shrink:0;"></i>
                        <span style="flex:1;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(f.name)}</span>
                        <span class="upload-status-${i}" style="font-size:.75rem;color:var(--text-muted);flex-shrink:0;">
                            ${(f.size/1024/1024).toFixed(1)} MB
                        </span>
                    </div>
                `).join('');
                startBtn.disabled = selectedFiles.length === 0;
            }

            function addFiles(files) {
                const audio = [...files].filter(f => /\.(mp3|m4a|ogg|wav|aac)$/i.test(f.name));
                // Deduplicate by name
                audio.forEach(f => {
                    if (!selectedFiles.find(x => x.name === f.name)) selectedFiles.push(f);
                });
                renderFileList();
            }

            dropZone.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => addFiles(fileInput.files));

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'var(--brand)';
                dropZone.style.background  = 'var(--brand-dim)';
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.style.borderColor = '';
                dropZone.style.background  = '';
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '';
                dropZone.style.background  = '';
                addFiles(e.dataTransfer.files);
            });

            startBtn.addEventListener('click', async () => {
                startBtn.disabled = true;
                startBtn.innerHTML = '<span class="btn-spinner"></span> Enviando…';
                document.getElementById('modal-cancel-btn').disabled = true;

                let done = 0, errors = 0;
                for (let i = 0; i < selectedFiles.length; i++) {
                    const f = selectedFiles[i];
                    const statusEl = document.querySelector(`.upload-status-${i}`);
                    if (statusEl) statusEl.innerHTML = '<span class="btn-spinner" style="width:12px;height:12px;border-width:2px;"></span>';

                    try {
                        const { error } = await window.supabaseClient.storage
                            .from('songs-audio')
                            .upload(f.name, f, { contentType: f.type || 'audio/mpeg', upsert: true });
                        if (error) throw error;
                        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i>';
                        done++;
                    } catch (err) {
                        if (statusEl) statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color:#ef4444;" title="${esc(err.message)}"></i>`;
                        errors++;
                    }
                }

                startBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${done} enviados${errors ? ', ' + errors + ' erros' : ''}`;
                document.getElementById('modal-cancel-btn').disabled = false;
                document.getElementById('modal-cancel-btn').textContent = 'Fechar';

                if (done > 0) {
                    // Offer to run Vincular Áudio right away
                    const footer = startBtn.parentElement;
                    const linkBtn = document.createElement('button');
                    linkBtn.className = 'btn btn-primary';
                    linkBtn.innerHTML = '<i class="fa-solid fa-link"></i> Vincular agora';
                    linkBtn.addEventListener('click', () => {
                        window.HMSApp.closeModal();
                        RepertoireComponent._bulkLinkAudio();
                    });
                    footer.appendChild(linkBtn);
                }
            });
        },

        // ── Bulk Link Audio ───────────────────────────────────────
        _bulkLinkAudio: async function () {
            window.HMSApp.showLoading();

            // 1. List bucket files
            let files;
            try {
                const { data, error } = await window.supabaseClient.storage
                    .from('songs-audio').list('', { limit: 1000 });
                if (error) throw error;
                files = (data || []).filter(f => f.name && /\.(mp3|m4a|ogg|wav|aac)$/i.test(f.name));
            } catch (err) {
                window.HMSApp.hideLoading();
                window.HMSApp.showToast('Erro ao listar bucket: ' + err.message, 'error');
                return;
            }

            // 2. Load songs
            let allSongs;
            try {
                allSongs = await window.HMSAPI.Songs.getAll();
            } catch (err) {
                window.HMSApp.hideLoading();
                window.HMSApp.showToast('Erro ao carregar músicas: ' + err.message, 'error');
                return;
            }
            window.HMSApp.hideLoading();

            if (files.length === 0) {
                window.HMSApp.showToast('Nenhum arquivo de áudio encontrado no bucket songs-audio.', 'warning');
                return;
            }

            // ── helpers ──────────────────────────────────────────────
            function norm(str) {
                return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase().replace(/\s+/g, ' ').trim();
            }

            // Map publicURL → song for songs that already have audio_url in the DB
            const urlToSong = {};
            allSongs.forEach(s => { if (s.audio_url) urlToSong[s.audio_url] = s; });

            // ── build rows: one per bucket file ──────────────────────
            const rows = files.map(file => {
                const { data: urlData } = window.supabaseClient.storage
                    .from('songs-audio').getPublicUrl(file.name);
                const url = urlData?.publicUrl;
                // Check actual DB state
                const linkedSong = url ? (urlToSong[url] || null) : null;
                return { file: file.name, url, linkedSong };
            });

            // Sort: linked first (alpha), then unlinked (alpha)
            rows.sort((a, b) => {
                if (a.linkedSong && !b.linkedSong) return -1;
                if (!a.linkedSong && b.linkedSong) return 1;
                return a.file.localeCompare(b.file);
            });

            const linkedCount   = rows.filter(r => r.linkedSong).length;
            const unlinkedCount = rows.length - linkedCount;

            const datalistOpts = allSongs
                .map(s => `<option value="${esc(s.title)}"></option>`).join('');

            const rowsHtml = rows.map((r, i) => {
                if (r.linkedSong) {
                    // Already linked row — informational only
                    return `
                    <div class="link-row" data-file="${esc(r.file)}" style="
                        display:flex;align-items:center;gap:8px;
                        background:var(--glass-bg);border:1px solid var(--glass-border);
                        border-radius:8px;padding:7px 12px;opacity:.8;">
                        <i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:.9rem;flex-shrink:0;"></i>
                        <span style="font-size:.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;flex-shrink:1;" title="${esc(r.file)}">${esc(r.file)}</span>
                        <span style="color:var(--text-muted);flex-shrink:0;font-size:.72rem;">→</span>
                        <span style="font-size:.82rem;font-weight:600;color:var(--text-primary);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(r.linkedSong.title)}">${esc(r.linkedSong.title)}</span>
                    </div>`;
                } else {
                    // Not linked — show search input
                    return `
                    <div class="link-row" data-file="${esc(r.file)}" style="
                        display:flex;align-items:center;gap:8px;
                        background:var(--glass-bg);border:1px solid #f59e0b44;
                        border-radius:8px;padding:7px 12px;">
                        <i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;font-size:.9rem;flex-shrink:0;"></i>
                        <span style="font-size:.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;flex-shrink:1;" title="${esc(r.file)}">${esc(r.file)}</span>
                        <span style="color:var(--text-muted);flex-shrink:0;font-size:.72rem;">→</span>
                        <input type="text" class="link-manual" data-file-idx="${i}"
                               list="songs-dl" autocomplete="off"
                               placeholder="Buscar música por nome…"
                               style="flex:1;min-width:0;padding:4px 10px;border-radius:6px;
                               border:1px solid var(--glass-border);background:var(--bg-raised);
                               color:var(--text-primary);font-size:.78rem;height:28px;box-sizing:border-box;">
                        <button class="link-save-btn" data-file-idx="${i}" title="Vincular"
                            style="flex-shrink:0;padding:4px 10px;border-radius:6px;border:none;
                            background:var(--brand);color:#fff;font-size:.75rem;cursor:pointer;height:28px;
                            display:flex;align-items:center;gap:4px;white-space:nowrap;">
                            <i class="fa-solid fa-link"></i>
                        </button>
                    </div>`;
                }
            }).join('');

            window.HMSApp.openModal(`
                <div class="modal-header">
                    <h3><i class="fa-solid fa-link"></i> Vincular Áudio</h3>
                    <button class="modal-close" id="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:10px;padding-bottom:0;">
                    <div style="display:flex;gap:16px;font-size:.82rem;flex-wrap:wrap;align-items:center;">
                        <span><strong>${files.length}</strong> <span style="color:var(--text-muted);">arquivos</span></span>
                        <span style="color:#22c55e;"><i class="fa-solid fa-circle-check" style="font-size:.7rem;"></i> <strong>${linkedCount}</strong> vinculados</span>
                        ${unlinkedCount ? `<span style="color:#f59e0b;"><i class="fa-solid fa-circle-exclamation" style="font-size:.7rem;"></i> <strong>${unlinkedCount}</strong> sem vínculo</span>` : ''}
                    </div>
                    <input id="link-search" type="text" placeholder="🔍 Filtrar por nome do arquivo..."
                        style="width:100%;box-sizing:border-box;padding:7px 12px;border-radius:8px;
                        border:1px solid var(--glass-border);background:var(--glass-bg);
                        color:var(--text-primary);font-size:.82rem;">
                    <div id="link-rows" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px;">
                        ${rowsHtml}
                    </div>
                    <datalist id="songs-dl">${datalistOpts}</datalist>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                </div>
            `);

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            // Filter rows by filename
            document.getElementById('link-search').addEventListener('input', function () {
                const q = this.value.toLowerCase();
                document.querySelectorAll('.link-row').forEach(row => {
                    row.style.display = (row.dataset.file || '').toLowerCase().includes(q) ? '' : 'none';
                });
            });

            // Per-row save buttons
            document.querySelectorAll('.link-save-btn').forEach(btn => {
                btn.addEventListener('click', async function () {
                    const idx   = parseInt(this.dataset.fileIdx);
                    const input = document.querySelector(`.link-manual[data-file-idx="${idx}"]`);
                    const title = (input?.value || '').trim();
                    if (!title) {
                        window.HMSApp.showToast('Digite o nome da música antes de vincular.', 'warning');
                        return;
                    }
                    const song = allSongs.find(s => norm(s.title) === norm(title));
                    if (!song) {
                        window.HMSApp.showToast(`Música "${title}" não encontrada.`, 'warning');
                        return;
                    }
                    const r = rows[idx];
                    this.disabled = true;
                    this.innerHTML = '<span class="btn-spinner" style="width:12px;height:12px;border-width:2px;"></span>';
                    try {
                        await window.HMSAPI.Songs.update(song.id, { audio_url: r.url });
                        // Update row in-place to show linked state
                        const row = this.closest('.link-row');
                        if (row) {
                            row.style.border = '1px solid var(--glass-border)';
                            row.style.opacity = '.8';
                            row.innerHTML = `
                                <i class="fa-solid fa-circle-check" style="color:#22c55e;font-size:.9rem;flex-shrink:0;"></i>
                                <span style="font-size:.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;flex-shrink:1;" title="${esc(r.file)}">${esc(r.file)}</span>
                                <span style="color:var(--text-muted);flex-shrink:0;font-size:.72rem;">→</span>
                                <span style="font-size:.82rem;font-weight:600;color:var(--text-primary);flex:1;">${esc(song.title)}</span>`;
                        }
                        window.HMSApp.showToast(`"${song.title}" vinculado!`, 'success');
                        // Update allSongs cache so next save reflects new state
                        song.audio_url = r.url;
                        urlToSong[r.url] = song;
                    } catch (e) {
                        this.disabled = false;
                        this.innerHTML = '<i class="fa-solid fa-link"></i>';
                        window.HMSApp.showToast('Erro ao vincular: ' + e.message, 'error');
                    }
                });
            });
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
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                            <input type="checkbox" id="chk-select-all" checked />
                            <label for="chk-select-all" style="font-size:.82rem;color:var(--text-secondary);cursor:pointer;">Selecionar todas (${total})</label>
                            <input type="text" id="hygiene-search" class="form-input" placeholder="Pesquisar por nome…"
                                style="flex:1;padding:4px 10px;font-size:.82rem;" />
                        </div>
                        <div id="hygiene-list" style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
                            ${candidates.map((s, idx) => `
                                <div class="hygiene-card" data-idx="${idx}" data-title="${esc((s.title || '').toLowerCase())}"
                                    style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:8px;padding:10px 12px;">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                        <input type="checkbox" class="hygiene-chk" data-idx="${idx}" checked />
                                        <strong style="font-size:.875rem;">${esc(s.title)}</strong>
                                        ${s.artist ? `<span style="font-size:.78rem;color:var(--text-muted);">— ${esc(s.artist)}</span>` : ''}
                                        ${s.original_key ? `<span style="font-size:.72rem;font-family:var(--font-mono);background:var(--glass-bg);border:1px solid var(--glass-border);padding:1px 6px;border-radius:4px;margin-left:auto;">${esc(s.original_key)}</span>` : ''}
                                    </div>
                                    <div style="font-family:var(--font-mono);font-size:.75rem;color:var(--text-secondary);background:var(--bg-deep);border:1px solid var(--glass-border);border-radius:4px;padding:5px 8px;margin-bottom:5px;line-height:1.6;word-break:break-all;">${esc(s._sanitized)}</div>
                                    <input class="hygiene-edit form-input" data-idx="${idx}"
                                        value="${esc(s._sanitized)}"
                                        style="width:100%;font-family:var(--font-mono);font-size:.78rem;padding:4px 8px;background:var(--bg-raised);border-radius:4px;margin-bottom:5px;" />
                                    <div class="hygiene-acor" data-idx="${idx}"
                                        style="font-size:.72rem;color:var(--chord-green);font-family:var(--font-mono);min-height:1.2em;opacity:.8;padding:2px 2px;word-break:break-word;"></div>
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
                // Search filter
                document.getElementById('hygiene-search').addEventListener('input', (e) => {
                    const q = e.target.value.toLowerCase();
                    document.querySelectorAll('.hygiene-card').forEach(card => {
                        card.style.display = (card.dataset.title || '').includes(q) ? '' : 'none';
                    });
                });

                // Select all
                document.getElementById('chk-select-all').addEventListener('change', (e) => {
                    document.querySelectorAll('.hygiene-chk').forEach(chk => { chk.checked = e.target.checked; });
                });

                // Chord preview helper
                function renderAcorPreview(harmStr, originalKey) {
                    const key = originalKey || 'C';
                    const isMinor = key.endsWith('m');
                    const root = key.replace(/m$/, '');
                    const norm = (harmStr || '').replace(/(?<![b#0-9mMho7])\((\S+?)\/\)/g, '$1 /');
                    const tokens = window.HarmonyEngine.translate(norm, root, isMinor);
                    return tokens.map(t => {
                        if (t.type === 'STRUCT') return t.value;
                        if (t.type === 'LABEL')  return t.value;
                        if (t.type === 'MOD')    return '!' + t.value + '!';
                        return t.value;
                    }).join(' ');
                }

                // Render initial previews + wire live update
                candidates.forEach((s, idx) => {
                    const acorEl = document.querySelector(`.hygiene-acor[data-idx="${idx}"]`);
                    const editEl = document.querySelector(`.hygiene-edit[data-idx="${idx}"]`);
                    if (acorEl && editEl) {
                        acorEl.textContent = renderAcorPreview(editEl.value, s.original_key);
                        editEl.addEventListener('input', () => {
                            acorEl.textContent = renderAcorPreview(editEl.value, s.original_key);
                        });
                    }
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
            // ── Excluir setlist ──────────────────────────────────────────
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

            // ── Copiar setlist ──────────────────────────────────────────
            document.querySelectorAll('.sl-copy-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const sl = _state.setlists.find(s => s.id === btn.dataset.id);
                    if (!sl) return;

                    const newName = prompt('Nome da cópia:', `Cópia de ${sl.name}`);
                    if (!newName || !newName.trim()) return;

                    btn.disabled = true;
                    btn.innerHTML = '<span class="btn-spinner"></span>';

                    try {
                        // 1. Busca todas as músicas da setlist original (com _position)
                        const songs = await window.HMSAPI.Songs.getAll({ setlistId: sl.id });

                        // 2. Cria a nova setlist
                        const newSl = await window.HMSAPI.Setlists.create(newName.trim());

                        // 3. Copia os vínculos preservando a ordem
                        for (const s of songs) {
                            await window.HMSAPI.Setlists.addSong(newSl.id, s.id, s._position ?? 0);
                        }

                        await RepertoireComponent._loadSetlists();
                        document.getElementById('setlist-list').innerHTML = RepertoireComponent._renderSetlistItems();
                        RepertoireComponent._bindSetlistDeleteButtons();
                        window.HMSApp.showToast(`"${newName.trim()}" criada com ${songs.length} música${songs.length !== 1 ? 's' : ''}!`, 'success');
                    } catch (err) {
                        window.HMSApp.showToast('Erro ao copiar: ' + err.message, 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-regular fa-clone"></i>';
                    }
                });
            });
        },

        // ── Status flag (0=none 1=green 2=yellow 3=red) ──────────
        _handleToggleAlert: async function (id) {
            const song = _state.songs.find(s => s.id === id);
            if (!song) return;
            const newVal = ((song.status_flag || 0) + 1) % 5;
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

                    // Snapshot original positions BEFORE first mutation.
                    // Without this, _savePositions() sees _originalPositions={} and
                    // tries to update ALL 122 songs simultaneously, silently failing.
                    if (Object.keys(_originalPositions).length === 0) {
                        _state.songs.forEach(s => {
                            if (s._position !== null && s._position !== undefined) {
                                _originalPositions[s.id] = s._position;
                            }
                        });
                    }

                    // Swap _position values
                    const tempPos = fromSong._position;
                    fromSong._position = toSong._position;
                    toSong._position   = tempPos;

                    // Re-assign positions sequentially to avoid collisions
                    const sortedByPos = [..._state.songs]
                        .filter(s => s._position !== null && s._position !== undefined)
                        .sort((a, b) => a._position - b._position);
                    sortedByPos.forEach((s, i) => { s._position = i + 1; });

                    _hasUnsavedOrder = true;

                    // Mostra o botão Salvar (sem auto-save — usuário clica quando quiser)
                    const saveBtn = document.getElementById('btn-save-order');
                    if (saveBtn) {
                        saveBtn.style.display = '';
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Ordem';
                    }

                    RepertoireComponent._renderSongList();
                });
            });
        },

        _savePositions: async function () {
            if (_isSaving) return;
            if (!_state.activeSetlist) return;

            // Requer snapshot — sem ele não sabemos o que mudou
            if (Object.keys(_originalPositions).length === 0) {
                window.HMSApp.showToast('Nenhuma alteração para salvar.', 'info');
                return;
            }

            const songsWithPos = _state.songs.filter(s => s._position !== null && s._position !== undefined);
            const changed = songsWithPos.filter(s => _originalPositions[s.id] !== s._position);

            if (changed.length === 0) {
                window.HMSApp.showToast('Nenhuma alteração para salvar.', 'info');
                _originalPositions = {};
                _hasUnsavedOrder   = false;
                const sb = document.getElementById('btn-save-order');
                if (sb) sb.style.display = 'none';
                return;
            }

            _isSaving = true;
            const saveBtn = document.getElementById('btn-save-order');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando…';
            }

            try {
                // Salva em lotes de 10 (evita sobrecarregar a API com requests paralelas)
                const CHUNK = 10;
                let totalSaved = 0;
                for (let i = 0; i < changed.length; i += CHUNK) {
                    const batch = changed.slice(i, i + CHUNK);
                    const results = await Promise.all(
                        batch.map(s =>
                            window.HMSAPI.Setlists.updateSongPosition(_state.activeSetlist, s.id, s._position)
                        )
                    );
                    totalSaved += results.reduce((acc, r) => acc + r.length, 0);
                }

                const failed = changed.length - totalSaved;
                window.HMSApp.showToast(
                    `Ordem salva!${failed > 0 ? ` (${failed} falhou no banco)` : ''}`,
                    failed > 0 ? 'warning' : 'success'
                );
                _originalPositions = {};
                _hasUnsavedOrder   = false;
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Ordem';
                    saveBtn.disabled  = false;
                    saveBtn.style.display = 'none';
                }
            } catch (err) {
                console.error('[HMS] _savePositions error:', err);
                window.HMSApp.showToast('Erro ao salvar: ' + err.message, 'error');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Ordem';
                }
            } finally {
                _isSaving = false;
            }
        },

        // ── Setlist Song Manager ──────────────────────────────────
        _openSetlistSongManager: async function () {
            const sl = _state.setlists.find(s => s.id === _state.activeSetlist);
            if (!sl) return;

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

            const posMap = {};
            _state.songs.forEach(s => { posMap[s.id] = s._position ?? null; });
            allSongs = allSongs.map(s => ({ ...s, _position: posMap[s.id] ?? null }));

            const _sortLabel = (() => {
                if (_state.sortBy === 'position') return 'Posição';
                if (_state.sortBy === 'key') return 'Tom';
                if (_state.sortBy === 'artist') return 'Artista';
                return 'Título';
            })();

            const _comparator = (a, b) => {
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
            };
            allSongs.sort(_comparator);

            // IDs already in setlist
            const inSetlistIds = new Set(_state.songs.map(s => s.id));

            // ── Filters & view mode ────────────────────────────────
            let smKeyFilter = null;
            let smSetFilter = null; // null | 'in' | 'out'
            let smViewMode  = 'grid'; // 'grid' | 'list'

            const _KEY_CHROMATIC = ['C','Db','C#','D','Eb','D#','E','F','F#','Gb','G','Ab','G#','A','Bb','A#','B',
                                    'Cm','C#m','Dbm','Dm','D#m','Ebm','Em','Fm','F#m','Gbm','Gm','G#m','Abm','Am','A#m','Bbm','Bm'];
            const uniqueSmKeys = [...new Set(allSongs.map(s => s.original_key).filter(Boolean))].sort((a, b) => {
                const ai = _KEY_CHROMATIC.indexOf(a), bi = _KEY_CHROMATIC.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
            });

            const renderList = (query, keyFilter, setFilter) => {
                // ── List / drag-and-drop mode ──
                if (smViewMode === 'list') {
                    let dragSongs = allSongs.filter(s => inSetlistIds.has(s.id))
                        .sort((a, b) => (a._position ?? 9999) - (b._position ?? 9999));
                    if (keyFilter) dragSongs = dragSongs.filter(s => s.original_key === keyFilter);
                    if (query)     dragSongs = dragSongs.filter(s =>
                        s.title.toLowerCase().includes(query.toLowerCase()) ||
                        (s.artist || '').toLowerCase().includes(query.toLowerCase())
                    );
                    if (!dragSongs.length) return '<p style="color:var(--text-muted);font-size:.85rem;padding:8px 0;">Nenhuma música na setlist.</p>';
                    return '<div id="sm-drag-list">' +
                        dragSongs.map((s, idx) => `
                            <div class="sm-drag-item" data-id="${s.id}" draggable="true"
                                style="display:flex;align-items:center;gap:10px;padding:8px 12px;
                                border:1px solid var(--brand);border-radius:6px;
                                background:var(--brand-dim);margin-bottom:4px;cursor:grab;user-select:none;transition:opacity .15s,border-color .15s;">
                                <i class="fa-solid fa-grip-vertical" style="color:var(--text-muted);flex-shrink:0;"></i>
                                <span style="color:var(--text-muted);font-size:.72rem;min-width:1.4rem;text-align:right;flex-shrink:0;">${idx + 1}</span>
                                <span style="font-size:.85rem;font-weight:600;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(s.title)}</span>
                                <span class="song-key-badge" style="font-size:.65rem;flex-shrink:0;">${esc(s.original_key || '?')}</span>
                                <button class="btn btn-sm btn-secondary sl-remove-btn" data-songid="${s.id}"
                                    style="padding:2px 8px;font-size:.72rem;flex-shrink:0;">
                                    <i class="fa-solid fa-minus"></i>
                                </button>
                            </div>`).join('') + '</div>';
                }

                // ── Grid mode ──
                let filtered = allSongs;
                if (setFilter === 'in')  filtered = filtered.filter(s =>  inSetlistIds.has(s.id));
                if (setFilter === 'out') filtered = filtered.filter(s => !inSetlistIds.has(s.id));
                if (keyFilter) filtered = filtered.filter(s => s.original_key === keyFilter);
                if (query)     filtered = filtered.filter(s =>
                    s.title.toLowerCase().includes(query.toLowerCase()) ||
                    (s.artist || '').toLowerCase().includes(query.toLowerCase())
                );
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
                <div style="padding:6px 20px 0;font-size:.75rem;color:var(--text-muted);flex-shrink:0;">
                    <i class="fa-solid fa-arrow-up-a-z" style="margin-right:4px;"></i>
                    Ordenado por <strong style="color:var(--text-secondary);">${_sortLabel}</strong>
                    ${_state.sortDir === 'desc' ? '↓' : '↑'}
                    &nbsp;·&nbsp; Músicas da setlist destacadas em roxo.
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;overflow:hidden;flex:1;min-height:0;">
                    <div id="sm-filter-bar" style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--glass-border);flex-shrink:0;">
                        ${uniqueSmKeys.map(k => `<button class="sort-btn sm-key-btn" data-key="${esc(k)}" style="font-size:.72rem;padding:3px 10px;min-width:2.4rem;">${esc(k)}</button>`).join('')}
                        ${uniqueSmKeys.length ? '<span style="color:var(--glass-border);font-size:1rem;margin:0 3px;line-height:1;">|</span>' : ''}
                        <button class="sort-btn sm-set-btn" data-set="in" style="font-size:.72rem;padding:3px 10px;">
                            <i class="fa-solid fa-check" style="font-size:.65rem;"></i> Na playlist
                        </button>
                        <button class="sort-btn sm-set-btn" data-set="out" style="font-size:.72rem;padding:3px 10px;">
                            <i class="fa-solid fa-xmark" style="font-size:.65rem;"></i> Fora
                        </button>
                        <span style="flex:1;min-width:8px;"></span>
                        <button class="sort-btn sm-view-btn active" data-view="grid"
                            title="Cards" style="font-size:.75rem;padding:3px 9px;">
                            <i class="fa-solid fa-grip"></i>
                        </button>
                        <button class="sort-btn sm-view-btn" data-view="list"
                            title="Lista (arraste para reordenar)" style="font-size:.75rem;padding:3px 9px;">
                            <i class="fa-solid fa-list"></i>
                        </button>
                    </div>
                    <div class="search-bar" style="margin-bottom:10px;flex-shrink:0;">
                        <input type="text" id="sm-search" class="form-input" placeholder="Buscar música…" />
                    </div>
                    <div id="sm-list" style="flex:1;overflow-y:auto;min-height:0;">
                        ${renderList('', null, null)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="modal-cancel-btn">Fechar</button>
                </div>
            `);
            document.getElementById('modal-container').classList.add('modal-lg');
            const _mc = document.querySelector('.modal-container');
            if (_mc) { _mc.style.cssText += ';overflow:hidden;display:flex;flex-direction:column;max-height:90vh;'; }

            document.getElementById('modal-close-btn').addEventListener('click', window.HMSApp.closeModal);
            document.getElementById('modal-cancel-btn').addEventListener('click', window.HMSApp.closeModal);

            const reRenderList = () => {
                const q = document.getElementById('sm-search')?.value.trim() || '';
                document.querySelectorAll('.sm-set-btn').forEach(b => {
                    b.style.display = smViewMode === 'list' ? 'none' : '';
                });
                document.getElementById('sm-list').innerHTML = renderList(q, smKeyFilter, smSetFilter);
                bindSmButtons();
                if (smViewMode === 'list') bindDragMode();
            };

            document.getElementById('sm-search').addEventListener('input', reRenderList);

            document.getElementById('sm-filter-bar')?.addEventListener('click', (e) => {
                const keyBtn = e.target.closest('.sm-key-btn');
                if (keyBtn) {
                    smKeyFilter = smKeyFilter === keyBtn.dataset.key ? null : keyBtn.dataset.key;
                    document.querySelectorAll('.sm-key-btn').forEach(b =>
                        b.classList.toggle('active', b.dataset.key === smKeyFilter)
                    );
                    reRenderList();
                    return;
                }
                const setBtn = e.target.closest('.sm-set-btn');
                if (setBtn) {
                    smSetFilter = smSetFilter === setBtn.dataset.set ? null : setBtn.dataset.set;
                    document.querySelectorAll('.sm-set-btn').forEach(b =>
                        b.classList.toggle('active', b.dataset.set === smSetFilter)
                    );
                    reRenderList();
                    return;
                }
                const viewBtn = e.target.closest('.sm-view-btn');
                if (viewBtn) {
                    smViewMode = viewBtn.dataset.view;
                    document.querySelectorAll('.sm-view-btn').forEach(b =>
                        b.classList.toggle('active', b.dataset.view === smViewMode)
                    );
                    if (smViewMode === 'list') smSetFilter = null;
                    reRenderList();
                }
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
                            const as = allSongs.find(x => x.id === songId);
                            if (as) as._position = nextPos;
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
                            reRenderList();
                            window.HMSApp.showToast('Música removida da setlist.', 'success');
                        } catch (err) {
                            window.HMSApp.showToast('Erro: ' + err.message, 'error');
                        }
                    });
                });
            };

            const bindDragMode = () => {
                const list = document.getElementById('sm-drag-list');
                if (!list) return;
                let _smDragId = null;
                list.querySelectorAll('.sm-drag-item').forEach(item => {
                    item.addEventListener('dragstart', e => {
                        _smDragId = item.dataset.id;
                        item.style.opacity = '0.4';
                        e.dataTransfer.effectAllowed = 'move';
                    });
                    item.addEventListener('dragend', () => {
                        item.style.opacity = '';
                        list.querySelectorAll('.sm-drag-item').forEach(c => { c.style.borderColor = ''; });
                    });
                    item.addEventListener('dragover', e => {
                        e.preventDefault();
                        if (item.dataset.id !== _smDragId) {
                            list.querySelectorAll('.sm-drag-item').forEach(c => { c.style.borderColor = ''; });
                            item.style.borderColor = 'var(--accent, #a78bfa)';
                        }
                    });
                    item.addEventListener('dragleave', () => {
                        item.style.borderColor = '';
                    });
                    item.addEventListener('drop', e => {
                        e.preventDefault();
                        const targetId = item.dataset.id;
                        if (!_smDragId || _smDragId === targetId) return;

                        const fromSong = _state.songs.find(s => s.id === _smDragId);
                        const toSong   = _state.songs.find(s => s.id === targetId);
                        if (!fromSong || !toSong) return;

                        // Swap positions
                        const tmp      = fromSong._position;
                        fromSong._position = toSong._position;
                        toSong._position   = tmp;

                        // Re-assign sequentially to avoid collisions
                        const sortedByPos = [..._state.songs]
                            .filter(s => s._position !== null && s._position !== undefined)
                            .sort((a, b) => a._position - b._position);
                        sortedByPos.forEach((s, i) => { s._position = i + 1; });

                        // Sync allSongs positions
                        allSongs.forEach(s => {
                            const match = _state.songs.find(x => x.id === s.id);
                            if (match) s._position = match._position;
                        });

                        // Persist & refresh
                        RepertoireComponent._savePositions();
                        RepertoireComponent._renderSongList();
                        reRenderList();
                    });
                });
            };

            bindSmButtons();
            if (isDragMode) bindDragMode();

        },

        // ── User Preferences ────────────────────────────────────────
        // Preferences are persisted per-user in localStorage so the repertoire
        // opens with the same setlist, sort and layout every time.

        _getPrefsKey: async function () {
            try {
                const { data: { user } } = await window.supabase.auth.getUser();
                return user ? `hms_rep_prefs_${user.id}` : 'hms_rep_prefs';
            } catch {
                return 'hms_rep_prefs';
            }
        },

        _savePrefs: async function () {
            const key = await RepertoireComponent._getPrefsKey();
            const prefs = {
                activeSetlist: _state.activeSetlist,
                sortBy:        _state.sortBy,
                sortDir:       _state.sortDir,
                showFlow:      _state.showFlow,
                showColumns:   _state.showColumns,
                viewMode:      _state.viewMode,
            };
            try {
                localStorage.setItem(key, JSON.stringify(prefs));
            } catch (e) {
                console.warn('[HMS] Erro ao salvar preferências:', e);
                return;
            }
            // Brief visual confirmation on the button
            const btn = document.getElementById('btn-save-prefs');
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = 'fa-solid fa-check';
                    btn.style.color = 'var(--success)';
                    setTimeout(() => {
                        icon.className  = 'fa-solid fa-bookmark';
                        btn.style.color = '';
                    }, 1800);
                }
            }
            console.info('[HMS] Preferências salvas:', prefs);
        },

        _loadPrefs: async function () {
            const key = await RepertoireComponent._getPrefsKey();
            const raw = localStorage.getItem(key);
            if (!raw) return;
            try {
                const prefs = JSON.parse(raw);
                if (prefs.activeSetlist !== undefined) _state.activeSetlist = prefs.activeSetlist;
                if (prefs.sortBy        !== undefined) _state.sortBy        = prefs.sortBy;
                if (prefs.sortDir       !== undefined) _state.sortDir       = prefs.sortDir;
                if (prefs.showFlow      !== undefined) _state.showFlow      = prefs.showFlow;
                if (prefs.showColumns   !== undefined) _state.showColumns   = prefs.showColumns;
                if (prefs.viewMode      !== undefined) _state.viewMode      = prefs.viewMode;
                console.info('[HMS] Preferências restauradas:', prefs);
            } catch (e) {
                console.warn('[HMS] Preferências inválidas, ignorando:', e);
            }
        },

    };

    window.RepertoireComponent = RepertoireComponent;
    console.info('[HMS] RepertoireComponent loaded.');
})();
