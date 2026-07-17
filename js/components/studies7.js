/**
 * HMS — Estudos Cadências
 * Estudo de audição de cadências em harmonia funcional.
 * Exposed via window.Studies7Component
 *
 * Tabs:
 *   Exemplos   — cadências pré-definidas (comportamento original)
 *   Repositório — CRUD de cadências nomeadas (salvo no banco)
 */
(function () {
    'use strict';

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const KEYS = window.HarmonyEngine.allKeys();

    // ── Cadências de exemplo ──────────────────────────────────────────
    const SECTIONS = [
        {
            id: 'livre',
            title: 'Livre',
            cadences: [
                { id: 'c_free', label: 'Livre',        harmony: '' },
            ],
        },
        {
            id: 'dom_tonica',
            title: 'Dominante → Tônica',
            cadences: [
                { id: 'c_51',   label: '5 → 1',       harmony: '5 1' },
            ],
        },
        {
            id: 'quadrado',
            title: 'Quadrado',
            cadences: [
                { id: 'q_1',    label: '1 5(2) 5',    harmony: '1 5(2) 5' },
            ],
        },
        {
            id: 'secundarias',
            title: 'Cadências Secundárias',
            cadences: [
                { id: 'c_25_4', label: '25 do 4',     harmony: '25(4) 4m' },
                { id: 'c_25_6', label: '25 do 6',     harmony: '25(6/)' },
                { id: 'c_25_3', label: '25 do 3',     harmony: '25(3)' },
                { id: 'c_5525', label: '5.5 / 251',   harmony: '5.5/ 25 1' },
                { id: 'c_comp', label: 'Completa',     harmony: '1 5(2) 5 25(4) 4m 3 5"2" 5.5/ 251' },
            ],
        },
    ];

    // ── Global state ──────────────────────────────────────────────────
    const _state = {
        key: 'C',
        isMinor: false,
        bpm: 80,
        playing: null,
        harmonies: {},
        showCavaco: false,
        showViolao: false,
        instrument: 'guitar',  // 'synth' | 'guitar' | 'cavaco'
        // Repositório
        tab:           'exemplos',
        cadences:      [],
        editingId:     null,
        newForm:       false,
        currentUserId: null,
    };

    // Seed harmonies from SECTIONS defaults
    SECTIONS.forEach(sec => sec.cadences.forEach(cad => {
        _state.harmonies[cad.id] = cad.harmony;
    }));

    // ── Helpers ───────────────────────────────────────────────────────
    function renderChordBar(harmony, key, isMinor) {
        const k = key     !== undefined ? key     : _state.key;
        const m = isMinor !== undefined ? isMinor : _state.isMinor;
        const tokens = window.HarmonyEngine.translate(harmony, k, m);
        let chordIdx = 0; // índice sequencial para highlight por posição
        return tokens.map(t => {
            if (t.type === 'LABEL')  return `<span class="harmony-text">${esc(t.value)}</span>`;
            // '/' repete o acorde anterior → recebe idx próprio para highlight
            if (t.type === 'STRUCT' && t.value === '/') {
                return `<div class="chord-cell struct" data-chord="/" data-chord-idx="${chordIdx++}">/</div>`;
            }
            if (t.type === 'STRUCT') return `<div class="chord-cell struct">${esc(t.value)}</div>`;
            const chordName = t.value || '';
            const cavacoSvg = (_state.showCavaco && window.ChordShapes)
                ? `<div class="chord-diagram-wrap">${window.ChordShapes.renderCavaco(chordName)}</div>` : '';
            const violaoSvg = (_state.showViolao && window.ChordShapes)
                ? `<div class="chord-diagram-wrap">${window.ChordShapes.renderViolao(chordName)}</div>` : '';
            return `<div class="chord-cell-wrap">
                <div class="chord-cell" data-chord="${esc(chordName)}" data-chord-idx="${chordIdx++}" style="font-size:1.1rem;padding:10px 18px;min-width:64px;">${esc(chordName)}</div>
                ${cavacoSvg}${violaoSvg}
            </div>`;
        }).join('');
    }

    function getChordSequenceText(cadId) {
        const tokens = window.HarmonyEngine.translate(_state.harmonies[cadId], _state.key, _state.isMinor);
        return tokens
            .filter(t => t.type !== 'LABEL' && t.type !== 'STRUCT')
            .map(t => t.value || '')
            .filter(v => v.trim() !== '')
            .join(' - ');
    }

    // ── HTML builders — Exemplos ──────────────────────────────────────
    function cadenceCardHtml(cad) {
        const isPlaying = _state.playing === cad.id;
        const harmony   = _state.harmonies[cad.id];
        return `
        <div class="panel" style="margin-bottom:0.75rem;" id="card-${esc(cad.id)}">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line-color);">
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);white-space:nowrap;min-width:90px;">${esc(cad.label)}</span>
                <input type="text" class="form-input s7-harmony-input" data-cadid="${esc(cad.id)}"
                    value="${esc(harmony)}"
                    style="flex:1;font-family:var(--font-mono);font-size:0.82rem;padding:5px 10px;">
                <button class="btn btn-ghost s7-copy-btn" data-cadid="${esc(cad.id)}"
                    title="Copiar sequência de acordes"
                    style="padding:5px 10px;font-size:0.85rem;flex-shrink:0;color:var(--text-secondary);border:1px solid var(--line-color);background:transparent;border-radius:6px;cursor:pointer;transition:all .2s;">
                    <i class="fa-regular fa-copy"></i>
                </button>
                <button class="btn ${isPlaying ? 'btn-secondary' : 'btn-primary'} s7-play-btn"
                    data-cadid="${esc(cad.id)}"
                    style="padding:5px 16px;font-size:0.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-${isPlaying ? 'stop' : 'play'}"></i>
                </button>
            </div>
            <div class="chord-grid size-md" style="padding:12px 14px;gap:8px;min-height:60px;flex-wrap:wrap;align-items:flex-start;" id="chords-${esc(cad.id)}">
                ${renderChordBar(harmony)}
            </div>
        </div>`;
    }

    function sectionHtml(sec) {
        return `
        <div style="margin-bottom:2rem;">
            <h3 style="font-size:1rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;
                letter-spacing:.06em;margin-bottom:0.75rem;border-bottom:1px solid var(--line-color);padding-bottom:6px;">
                ${esc(sec.title)}
            </h3>
            ${sec.cadences.map(cadenceCardHtml).join('')}
        </div>`;
    }

    // ── HTML builders — Repositório ───────────────────────────────────
    function repoCadenceCardHtml(c) {
        const isPlaying = _state.playing === 'rp_' + c.id;
        const keyVal    = c.root + (c.is_minor ? 'm' : '');
        const keyLabel  = KEYS.find(k => k.value === keyVal)?.label || c.root;
        return `
        <div class="panel" style="margin-bottom:.75rem;" id="rc-card-${esc(c.id)}">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line-color);">
                <div style="flex:1;min-width:0;">
                    <span style="font-size:.9rem;font-weight:600;color:var(--text-primary);">${esc(c.title)}</span>
                    ${c.description ? `<span style="font-size:.75rem;color:var(--text-muted);margin-left:8px;">${esc(c.description)}</span>` : ''}
                </div>
                <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${esc(keyLabel)} · ${c.bpm || 60} BPM</span>
                <button class="btn ${isPlaying ? 'btn-secondary' : 'btn-primary'} rc-play-btn"
                    data-id="${esc(c.id)}" style="padding:5px 14px;font-size:.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-${isPlaying ? 'stop' : 'play'}"></i>
                </button>
                <button class="btn btn-ghost rc-edit-btn" data-id="${esc(c.id)}" title="Editar"
                    style="padding:5px 10px;font-size:.85rem;flex-shrink:0;">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-ghost rc-del-btn" data-id="${esc(c.id)}" title="Deletar"
                    style="padding:5px 10px;font-size:.85rem;flex-shrink:0;color:var(--chord-red,#f87171);">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="chord-grid size-md" style="padding:12px 14px;gap:8px;min-height:52px;flex-wrap:wrap;align-items:flex-start;">
                ${renderChordBar(c.harmony, c.root, c.is_minor)}
            </div>
        </div>`;
    }

    function repoCadenceEditCardHtml(c) {
        const keyVal    = c.root + (c.is_minor ? 'm' : '');
        const keyOptions = KEYS.map(k =>
            `<option value="${esc(k.value)}" ${k.value === keyVal ? 'selected' : ''}>${esc(k.label)}</option>`
        ).join('');
        return `
        <div class="panel" style="margin-bottom:.75rem;border:1px solid var(--brand,#7c3aed);" id="rc-card-${esc(c.id)}">
            <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;gap:8px;">
                    <input type="text" class="form-input" id="rc-edit-title-${esc(c.id)}"
                        value="${esc(c.title)}" placeholder="Nome da cadência*" style="flex:1;" />
                    <input type="text" class="form-input" id="rc-edit-desc-${esc(c.id)}"
                        value="${esc(c.description || '')}" placeholder="Descrição" style="flex:2;" />
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input type="text" class="form-input rc-edit-harmony" data-id="${esc(c.id)}"
                        id="rc-edit-harmony-${esc(c.id)}" value="${esc(c.harmony)}"
                        placeholder="ex: 25(1) 1  ou  1 5(2) 5"
                        style="flex:1;font-family:var(--font-mono);font-size:.82rem;" />
                    <select class="form-select" id="rc-edit-key-${esc(c.id)}" style="width:auto;">${keyOptions}</select>
                    <input type="number" class="form-input" id="rc-edit-bpm-${esc(c.id)}"
                        value="${c.bpm || 60}" min="20" max="300"
                        style="width:68px;text-align:center;" title="BPM" />
                </div>
                <div class="chord-grid size-md" style="padding:4px 0;gap:8px;min-height:52px;flex-wrap:wrap;align-items:flex-start;"
                    id="rc-edit-chords-${esc(c.id)}">
                    ${renderChordBar(c.harmony, c.root, c.is_minor)}
                </div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="btn btn-secondary rc-cancel-edit-btn" data-id="${esc(c.id)}">Cancelar</button>
                    <button class="btn btn-primary rc-save-edit-btn" data-id="${esc(c.id)}">
                        <i class="fa-solid fa-check"></i> Salvar
                    </button>
                </div>
            </div>
        </div>`;
    }

    // ── Component ─────────────────────────────────────────────────────
    const Studies7Component = {

        render: function () {
            const C = Studies7Component;
            const content = document.getElementById('main-content');
            const tabStyle = (active) =>
                `padding:7px 18px;border-radius:var(--radius-sm,6px);font-size:.85rem;cursor:pointer;` +
                `font-weight:${active ? '600' : '400'};` +
                `background:${active ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--glass-bg,rgba(255,255,255,.04))'};` +
                `border:1px solid ${active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))'};` +
                `color:${active ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};`;

            content.innerHTML = `
                <div style="display:flex;gap:8px;margin-bottom:1.25rem;">
                    <button class="s7-tab" data-tab="exemplos" style="${tabStyle(_state.tab === 'exemplos')}">
                        <i class="fa-solid fa-book-open"></i> Exemplos
                    </button>
                    <button class="s7-tab" data-tab="repositorio" style="${tabStyle(_state.tab === 'repositorio')}">
                        <i class="fa-solid fa-folder-open"></i> Repositório
                    </button>
                </div>
                <div id="s7-tab-content"></div>
            `;

            document.querySelectorAll('.s7-tab').forEach(btn => {
                btn.addEventListener('click', e => {
                    _state.tab = e.currentTarget.dataset.tab;
                    C.render();
                });
            });

            if (_state.tab === 'exemplos') {
                C._renderExemplos();
            } else {
                C._renderRepositorio();
            }
        },

        // ── Exemplos tab ──────────────────────────────────────────────

        _renderExemplos: function () {
            const C = Studies7Component;
            const keyOptions = KEYS.map(k =>
                `<option value="${esc(k.value)}" ${k.value === (_state.key + (_state.isMinor ? 'm' : '')) ? 'selected' : ''}>${esc(k.label)}</option>`
            ).join('');

            document.getElementById('s7-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-ear-listen"></i></div>
                        <div>
                            <h2>Estudos Cadências</h2>
                            <p>Estudo de audição em harmonia funcional</p>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;">
                        <select class="form-select" id="s7-global-key" style="width:auto;">
                            ${keyOptions}
                        </select>
                        <input type="number" class="form-input" id="s7-global-bpm"
                            value="${_state.bpm}" min="20" max="300"
                            style="width:68px;text-align:center;" title="BPM">
                        <div style="display:flex;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden;">
                            <button class="s7-ins-btn ${_state.instrument==='synth'   ? 'active':''}"
                                data-ins="synth"  title="Synth (piano)" style="padding:6px 10px;border:none;background:${_state.instrument==='synth'   ? 'var(--brand-dim)':'transparent'};color:${_state.instrument==='synth'   ? 'var(--brand)':'var(--text-muted)'};cursor:pointer;font-size:.8rem;font-family:var(--font-ui);font-weight:600;transition:all .15s;">
                                <i class="fa-solid fa-piano-keyboard"></i> Synth
                            </button>
                            <button class="s7-ins-btn ${_state.instrument==='guitar'  ? 'active':''}"
                                data-ins="guitar" title="Samples violão" style="padding:6px 10px;border:none;border-left:1px solid var(--glass-border);background:${_state.instrument==='guitar'  ? 'var(--brand-dim)':'transparent'};color:${_state.instrument==='guitar'  ? 'var(--brand)':'var(--text-muted)'};cursor:pointer;font-size:.8rem;font-family:var(--font-ui);font-weight:600;transition:all .15s;">
                                <i class="fa-solid fa-guitar"></i> Violão
                            </button>
                            <button class="s7-ins-btn ${_state.instrument==='cavaco'  ? 'active':''}"
                                data-ins="cavaco" title="Samples cavaco" style="padding:6px 10px;border:none;border-left:1px solid var(--glass-border);background:${_state.instrument==='cavaco'  ? 'var(--brand-dim)':'transparent'};color:${_state.instrument==='cavaco'  ? 'var(--brand)':'var(--text-muted)'};cursor:pointer;font-size:.8rem;font-family:var(--font-ui);font-weight:600;transition:all .15s;">
                                <i class="fa-solid fa-music"></i> Cavaco
                            </button>
                        </div>
                        <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer;color:var(--text-secondary);">
                            <input type="checkbox" id="s7-flag-cavaco" ${_state.showCavaco ? 'checked' : ''}>
                            Acorde Cavaco
                        </label>
                        <label style="display:flex;align-items:center;gap:5px;font-size:.82rem;cursor:pointer;color:var(--text-secondary);">
                            <input type="checkbox" id="s7-flag-violao" ${_state.showViolao ? 'checked' : ''}>
                            Acorde Violão
                        </label>
                    </div>
                </div>
                <div id="s7-sections">
                    ${SECTIONS.map(sectionHtml).join('')}
                </div>
            `;
            C._bindExemplosEvents();
        },

        _refreshAllChords: function () {
            SECTIONS.forEach(sec => sec.cadences.forEach(cad => {
                const bar = document.getElementById('chords-' + cad.id);
                if (bar) bar.innerHTML = renderChordBar(_state.harmonies[cad.id]);
            }));
        },

        _bindExemplosEvents: function () {
            const C = Studies7Component;

            document.getElementById('s7-global-key').addEventListener('change', e => {
                const val = e.target.value;
                _state.isMinor = val.endsWith('m');
                _state.key     = val.replace(/m$/, '');
                C._refreshAllChords();
            });

            document.getElementById('s7-global-bpm').addEventListener('change', e => {
                _state.bpm = Math.max(40, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _state.bpm;
            });

            // Seletor de instrumento
            document.querySelectorAll('.s7-ins-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    _state.instrument = btn.dataset.ins;
                    document.querySelectorAll('.s7-ins-btn').forEach(b => {
                        const on = b.dataset.ins === _state.instrument;
                        b.style.background = on ? 'var(--brand-dim)' : 'transparent';
                        b.style.color      = on ? 'var(--brand)'     : 'var(--text-muted)';
                    });
                });
            });

            document.getElementById('s7-flag-cavaco').addEventListener('change', e => {
                _state.showCavaco = e.target.checked;
                C._refreshAllChords();
            });

            document.getElementById('s7-flag-violao').addEventListener('change', e => {
                _state.showViolao = e.target.checked;
                C._refreshAllChords();
            });


            // Editable harmony inputs — update chord bar live
            document.querySelectorAll('.s7-harmony-input').forEach(inp => {
                inp.addEventListener('input', e => {
                    const cadId = e.target.dataset.cadid;
                    _state.harmonies[cadId] = e.target.value;
                    const bar = document.getElementById('chords-' + cadId);
                    if (bar) bar.innerHTML = renderChordBar(_state.harmonies[cadId]);
                });
            });

            document.querySelectorAll('.s7-copy-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const cadId = e.currentTarget.dataset.cadid;
                    const text  = getChordSequenceText(cadId);
                    if (!text) return;
                    navigator.clipboard.writeText(text).then(() => {
                        const icon = btn.querySelector('i');
                        icon.className = 'fa-solid fa-check';
                        btn.style.color = '#4caf50';
                        btn.style.borderColor = '#4caf50';
                        setTimeout(() => {
                            icon.className = 'fa-regular fa-copy';
                            btn.style.color = '';
                            btn.style.borderColor = '';
                        }, 1500);
                    }).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                    });
                });
            });

            document.querySelectorAll('.s7-play-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    const cadId = e.currentTarget.dataset.cadid;
                    Studies7Component._togglePlay(cadId);
                });
            });
        },

        // ── Repositório tab ───────────────────────────────────────────

        _renderRepositorio: function () {
            const C = Studies7Component;

            document.getElementById('s7-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-folder-open"></i></div>
                        <div>
                            <h2>Repositório de Cadências</h2>
                            <p>Cadências salvas — crie, nomeie e reproduza</p>
                        </div>
                    </div>
                    <div style="display:flex;border:1px solid var(--glass-border);border-radius:8px;overflow:hidden;flex-shrink:0;">
                        <button class="s7-ins-btn ${_state.instrument==='synth'  ?'active':''}" data-ins="synth"
                            style="padding:6px 12px;border:none;font-size:.8rem;font-family:var(--font-ui);font-weight:600;cursor:pointer;transition:all .15s;
                            background:${_state.instrument==='synth'  ?'var(--brand-dim)':'transparent'};
                            color:${_state.instrument==='synth'       ?'var(--brand)':'var(--text-muted)'}">
                            <i class="fa-solid fa-wave-square"></i> Synth
                        </button>
                        <button class="s7-ins-btn ${_state.instrument==='guitar' ?'active':''}" data-ins="guitar"
                            style="padding:6px 12px;border:none;border-left:1px solid var(--glass-border);font-size:.8rem;font-family:var(--font-ui);font-weight:600;cursor:pointer;transition:all .15s;
                            background:${_state.instrument==='guitar' ?'var(--brand-dim)':'transparent'};
                            color:${_state.instrument==='guitar'      ?'var(--brand)':'var(--text-muted)'}">
                            <i class="fa-solid fa-guitar"></i> Violão
                        </button>
                        <button class="s7-ins-btn ${_state.instrument==='cavaco' ?'active':''}" data-ins="cavaco"
                            style="padding:6px 12px;border:none;border-left:1px solid var(--glass-border);font-size:.8rem;font-family:var(--font-ui);font-weight:600;cursor:pointer;transition:all .15s;
                            background:${_state.instrument==='cavaco' ?'var(--brand-dim)':'transparent'};
                            color:${_state.instrument==='cavaco'      ?'var(--brand)':'var(--text-muted)'}">
                            <i class="fa-solid fa-music"></i> Cavaco
                        </button>
                    </div>
                </div>
                <div style="margin-bottom:1rem;">
                    <button class="btn btn-primary" id="rc-btn-new">
                        <i class="fa-solid fa-plus"></i> Nova Cadência
                    </button>
                </div>
                <div id="rc-new-form-container"></div>
                <div id="rc-list">
                    <div style="text-align:center;padding:2rem;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-spin"></i> Carregando…
                    </div>
                </div>
            `;

            document.getElementById('rc-btn-new').addEventListener('click', () => {
                _state.newForm = !_state.newForm;
                C._renderNewForm();
            });

            // Seletor de instrumento (compartilhado com Exemplos via _state.instrument)
            document.querySelectorAll('.s7-ins-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    _state.instrument = btn.dataset.ins;
                    document.querySelectorAll('.s7-ins-btn').forEach(b => {
                        const on = b.dataset.ins === _state.instrument;
                        b.style.background = on ? 'var(--brand-dim)' : 'transparent';
                        b.style.color      = on ? 'var(--brand)'     : 'var(--text-muted)';
                    });
                });
            });

            // Event delegation for list actions
            const listEl = document.getElementById('rc-list');
            listEl.addEventListener('click', e => {
                const play       = e.target.closest('.rc-play-btn');
                const edit       = e.target.closest('.rc-edit-btn');
                const del        = e.target.closest('.rc-del-btn');
                const saveEdit   = e.target.closest('.rc-save-edit-btn');
                const cancelEdit = e.target.closest('.rc-cancel-edit-btn');
                if (play)       C._togglePlayCadence(play.dataset.id);
                if (edit)       { _state.editingId = edit.dataset.id; C._refreshCard(edit.dataset.id); }
                if (del)        C._deleteCadence(del.dataset.id);
                if (saveEdit)   C._updateCadence(saveEdit.dataset.id);
                if (cancelEdit) { _state.editingId = null; C._refreshCard(cancelEdit.dataset.id); }
            });

            // Live chord preview in edit cards
            listEl.addEventListener('input', e => {
                const inp = e.target.closest('.rc-edit-harmony');
                if (!inp) return;
                const id    = inp.dataset.id;
                const keyV  = document.getElementById('rc-edit-key-' + id)?.value || 'C';
                const m     = keyV.endsWith('m');
                const k     = keyV.replace(/m$/, '');
                const chBar = document.getElementById('rc-edit-chords-' + id);
                if (chBar) chBar.innerHTML = renderChordBar(inp.value, k, m);
            });
            listEl.addEventListener('change', e => {
                const isKey = e.target.id?.startsWith('rc-edit-key-');
                if (!isKey) return;
                const id    = e.target.id.replace('rc-edit-key-', '');
                const keyV  = e.target.value;
                const m     = keyV.endsWith('m');
                const k     = keyV.replace(/m$/, '');
                const harm  = document.getElementById('rc-edit-harmony-' + id)?.value || '';
                const chBar = document.getElementById('rc-edit-chords-' + id);
                if (chBar) chBar.innerHTML = renderChordBar(harm, k, m);
            });

            C._loadCadences().then(() => C._renderCadenceList());
        },

        _loadCadences: async function () {
            try {
                const user = await window.HMSAuth.currentUser();
                _state.currentUserId = user?.id || null;
                _state.cadences = await window.HMSAPI.CadencePhrases.getAll();
            } catch (_e) {
                window.HMSApp.showToast('Erro ao carregar cadências.', 'error');
                _state.cadences = [];
            }
        },

        _renderCadenceList: function () {
            const listEl = document.getElementById('rc-list');
            if (!listEl) return;
            if (!_state.cadences.length) {
                listEl.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                        <i class="fa-solid fa-ear-listen" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.75rem;"></i>
                        Nenhuma cadência salva ainda. Crie a primeira!
                    </div>`;
                return;
            }
            listEl.innerHTML = _state.cadences.map(c =>
                _state.editingId === c.id ? repoCadenceEditCardHtml(c) : repoCadenceCardHtml(c)
            ).join('');
        },

        _refreshCard: function (id) {
            const card = document.getElementById('rc-card-' + id);
            if (!card) return;
            const cad  = _state.cadences.find(c => c.id === id);
            if (!cad) return;
            const tmp  = document.createElement('div');
            tmp.innerHTML = _state.editingId === id ? repoCadenceEditCardHtml(cad) : repoCadenceCardHtml(cad);
            card.replaceWith(tmp.firstElementChild);
        },

        _renderNewForm: function () {
            const C = Studies7Component;
            const container = document.getElementById('rc-new-form-container');
            if (!container) return;
            if (!_state.newForm) { container.innerHTML = ''; return; }

            const keyOptions = KEYS.map(k =>
                `<option value="${esc(k.value)}" ${k.value === (_state.key + (_state.isMinor ? 'm' : '')) ? 'selected' : ''}>${esc(k.label)}</option>`
            ).join('');

            container.innerHTML = `
            <div class="panel" style="margin-bottom:1.25rem;border:1px solid var(--brand,#7c3aed);">
                <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:8px;">
                        <input type="text" class="form-input" id="rc-title" placeholder="Nome da cadência*" style="flex:1;" />
                        <input type="text" class="form-input" id="rc-desc"  placeholder="Descrição (opcional)" style="flex:2;" />
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <input type="text" class="form-input" id="rc-harmony"
                            placeholder="ex: 25(1) 1  ou  1 5(2) 5"
                            style="flex:1;font-family:var(--font-mono);font-size:.82rem;" />
                        <select class="form-select" id="rc-key" style="width:auto;">${keyOptions}</select>
                        <input type="number" class="form-input" id="rc-bpm" value="${_state.bpm}"
                            min="20" max="300" style="width:68px;text-align:center;" title="BPM" />
                    </div>
                    <div class="chord-grid size-md" style="padding:4px 0;gap:8px;min-height:52px;flex-wrap:wrap;align-items:flex-start;"
                        id="rc-new-chords"></div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="btn btn-secondary" id="rc-cancel-new">Cancelar</button>
                        <button class="btn btn-primary"   id="rc-save-new">
                            <i class="fa-solid fa-check"></i> Salvar Cadência
                        </button>
                    </div>
                </div>
            </div>`;

            const updateNewPreview = () => {
                const harm = document.getElementById('rc-harmony').value;
                const keyV = document.getElementById('rc-key').value;
                const m    = keyV.endsWith('m');
                const k    = keyV.replace(/m$/, '');
                document.getElementById('rc-new-chords').innerHTML = renderChordBar(harm, k, m);
            };
            document.getElementById('rc-harmony').addEventListener('input',  updateNewPreview);
            document.getElementById('rc-key').addEventListener('change',     updateNewPreview);
            document.getElementById('rc-cancel-new').addEventListener('click', () => {
                _state.newForm = false;
                C._renderNewForm();
            });
            document.getElementById('rc-save-new').addEventListener('click', () => C._saveNewCadence());
        },

        _saveNewCadence: async function () {
            const C       = Studies7Component;
            const title   = (document.getElementById('rc-title')?.value   || '').trim();
            const desc    = (document.getElementById('rc-desc')?.value    || '').trim();
            const harmony = (document.getElementById('rc-harmony')?.value || '').trim();
            const keyV    = document.getElementById('rc-key')?.value || 'C';
            const is_minor = keyV.endsWith('m');
            const root    = keyV.replace(/m$/, '');
            const bpm     = parseInt(document.getElementById('rc-bpm')?.value) || 60;
            if (!title) { window.HMSApp.showToast('Nome obrigatório.', 'warning'); return; }
            try {
                const saved = await window.HMSAPI.CadencePhrases.create({ title, description: desc, harmony, root, is_minor, bpm });
                _state.cadences.unshift(saved);
                _state.newForm = false;
                C._renderNewForm();
                C._renderCadenceList();
                window.HMSApp.showToast('Cadência salva!', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao salvar: ' + (e.message || e), 'error');
            }
        },

        _updateCadence: async function (id) {
            const C       = Studies7Component;
            const title   = (document.getElementById('rc-edit-title-'   + id)?.value || '').trim();
            const desc    = (document.getElementById('rc-edit-desc-'    + id)?.value || '').trim();
            const harmony = (document.getElementById('rc-edit-harmony-' + id)?.value || '').trim();
            const keyV    = document.getElementById('rc-edit-key-' + id)?.value || 'C';
            const is_minor = keyV.endsWith('m');
            const root    = keyV.replace(/m$/, '');
            const bpm     = parseInt(document.getElementById('rc-edit-bpm-' + id)?.value) || 60;
            if (!title) { window.HMSApp.showToast('Nome obrigatório.', 'warning'); return; }
            try {
                const updated = await window.HMSAPI.CadencePhrases.update(id, { title, description: desc, harmony, root, is_minor, bpm });
                const idx = _state.cadences.findIndex(c => c.id === id);
                if (idx !== -1) _state.cadences[idx] = updated;
                _state.editingId = null;
                C._refreshCard(id);
                window.HMSApp.showToast('Cadência atualizada!', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao atualizar: ' + (e.message || e), 'error');
            }
        },

        _deleteCadence: async function (id) {
            if (!confirm('Deletar esta cadência?')) return;
            try {
                await window.HMSAPI.CadencePhrases.delete(id);
                _state.cadences = _state.cadences.filter(c => c.id !== id);
                document.getElementById('rc-card-' + id)?.remove();
                if (!_state.cadences.length) Studies7Component._renderCadenceList();
                window.HMSApp.showToast('Cadência removida.', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao deletar: ' + (e.message || e), 'error');
            }
        },

        // ── Playback — Repositório ────────────────────────────────────
        _togglePlayCadence: function (id) {
            const C       = Studies7Component;
            const playKey = 'rp_' + id;
            if (_state.playing) {
                window.HMSAudio.stop();
                const prevKey = _state.playing;
                if (prevKey.startsWith('rp_')) {
                    const prevId = prevKey.slice(3);
                    const btn = document.querySelector(`.rc-play-btn[data-id="${prevId}"]`);
                    if (btn) { btn.innerHTML = '<i class="fa-solid fa-play"></i>'; btn.className = 'btn btn-primary rc-play-btn'; }
                    // Remove highlight da cadência anterior
                    document.querySelectorAll(`#rc-card-${prevId} .chord-cell.chord-active`).forEach(c => c.classList.remove('chord-active'));
                } else {
                    C._setPlayingUI(prevKey, false);
                    document.querySelectorAll(`#card-${prevKey} .chord-cell.chord-active`).forEach(c => c.classList.remove('chord-active'));
                }
                const wasSame = prevKey === playKey;
                _state.playing = null;
                if (wasSame) return;
            }
            const cad      = _state.cadences.find(c => c.id === id);
            if (!cad) return;
            const tokens   = window.HarmonyEngine.translate(cad.harmony, cad.root, cad.is_minor);
            const strumMode = _state.instrument === 'guitar' ? 'guitar-sample'
                            : _state.instrument === 'cavaco' ? 'cavaco-sample'
                            : 'basic';
            _state.playing  = playKey;
            const playBtn   = document.querySelector(`.rc-play-btn[data-id="${id}"]`);
            if (playBtn) { playBtn.innerHTML = '<i class="fa-solid fa-stop"></i>'; playBtn.className = 'btn btn-secondary rc-play-btn'; }

            // Lê os chips do DOM do card — mesma fonte que a tela
            const cardEl = document.getElementById('rc-card-' + id);
            const _rcChips = cardEl ? [...cardEl.querySelectorAll('.chord-cell[data-chord]')] : [];
            const _rcList = []; let _rcLast = null;
            for (const ch of _rcChips) {
                const v = ch.dataset.chord; const di = parseInt(ch.dataset.chordIdx, 10);
                if (v === '/') { if (_rcLast) _rcList.push({ chord: _rcLast.chord, domIdx: di }); }
                else if (/^[A-G]/.test(v)) { const e = { chord: v, domIdx: di }; _rcList.push(e); _rcLast = e; }
            }
            const _rcOverride = _rcList.map(e => e.chord);
            const _rcDomMap   = _rcList.map(e => e.domIdx);

            const onChordChange = (seqIdx, chordValue) => {
                if (!cardEl) return;
                cardEl.querySelectorAll('.chord-cell.chord-active').forEach(c => c.classList.remove('chord-active'));
                const domIdx = _rcDomMap[seqIdx];
                if (domIdx != null && !isNaN(domIdx)) {
                    const chip = cardEl.querySelector(`.chord-cell[data-chord-idx="${domIdx}"]`);
                    if (chip) { chip.classList.add('chord-active'); return; }
                }
                const first = [...cardEl.querySelectorAll('.chord-cell[data-chord]')].find(c => c.dataset.chord === chordValue);
                if (first) first.classList.add('chord-active');
            };

            window.HMSAudio.playSequence(null, cad.bpm || _state.bpm, () => {
                _state.playing = null;
                const btn = document.querySelector(`.rc-play-btn[data-id="${id}"]`);
                if (btn) { btn.innerHTML = '<i class="fa-solid fa-play"></i>'; btn.className = 'btn btn-primary rc-play-btn'; }
                if (cardEl) cardEl.querySelectorAll('.chord-cell.chord-active').forEach(c => c.classList.remove('chord-active'));
            }, strumMode, onChordChange, _rcOverride);
        },

        // ── Playback — Exemplos ───────────────────────────────────────
        _setPlayingUI: function (cadId, playing) {
            const btn = document.querySelector(`.s7-play-btn[data-cadid="${cadId}"]`);
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'play'}"></i>`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-primary'} s7-play-btn`;
        },

        _togglePlay: function (cadId) {
            const C = Studies7Component;
            if (_state.playing) {
                window.HMSAudio.stop();
                const prev = _state.playing;
                if (prev.startsWith('rp_')) {
                    const prevId = prev.slice(3);
                    const btn = document.querySelector(`.rc-play-btn[data-id="${prevId}"]`);
                    if (btn) { btn.innerHTML = '<i class="fa-solid fa-play"></i>'; btn.className = 'btn btn-primary rc-play-btn'; }
                    document.querySelectorAll(`#rc-card-${prevId} .chord-cell.chord-active`).forEach(c => c.classList.remove('chord-active'));
                } else {
                    C._setPlayingUI(prev, false);
                    document.querySelectorAll(`#card-${prev} .chord-cell.chord-active`).forEach(c => c.classList.remove('chord-active'));
                }
                const wasSame = _state.playing === cadId;
                _state.playing = null;
                if (wasSame) return;
            }
            const tokens   = window.HarmonyEngine.translate(_state.harmonies[cadId], _state.key, _state.isMinor);
            const strumMode = _state.instrument === 'guitar' ? 'guitar-sample'
                            : _state.instrument === 'cavaco' ? 'cavaco-sample'
                            : 'basic';
            _state.playing = cadId;
            C._setPlayingUI(cadId, true);

            // Lê os chips do DOM do card — mesma fonte que a tela
            const cardEl = document.getElementById('card-' + cadId);
            const _s7Chips = cardEl ? [...cardEl.querySelectorAll('.chord-cell[data-chord]')] : [];
            const _s7List = []; let _s7Last = null;
            for (const ch of _s7Chips) {
                const v = ch.dataset.chord; const di = parseInt(ch.dataset.chordIdx, 10);
                if (v === '/') { if (_s7Last) _s7List.push({ chord: _s7Last.chord, domIdx: di }); }
                else if (/^[A-G]/.test(v)) { const e = { chord: v, domIdx: di }; _s7List.push(e); _s7Last = e; }
            }
            const _s7Override = _s7List.map(e => e.chord);
            const _s7DomMap   = _s7List.map(e => e.domIdx);

            const onChordChange = (seqIdx, chordValue) => {
                if (!cardEl) return;
                cardEl.querySelectorAll('.chord-cell.chord-active').forEach(c => c.classList.remove('chord-active'));
                const domIdx = _s7DomMap[seqIdx];
                if (domIdx != null && !isNaN(domIdx)) {
                    const chip = cardEl.querySelector(`.chord-cell[data-chord-idx="${domIdx}"]`);
                    if (chip) { chip.classList.add('chord-active'); return; }
                }
                const first = [...cardEl.querySelectorAll('.chord-cell[data-chord]')].find(c => c.dataset.chord === chordValue);
                if (first) first.classList.add('chord-active');
            };

            window.HMSAudio.playSequence(null, _state.bpm, () => {
                _state.playing = null;
                C._setPlayingUI(cadId, false);
                if (cardEl) cardEl.querySelectorAll('.chord-cell.chord-active').forEach(c => c.classList.remove('chord-active'));
            }, strumMode, onChordChange, _s7Override);
        },
    };

    window.Studies7Component = Studies7Component;
    console.info('[HMS] Studies7Component (Estudos Cadências) loaded.');
})();
