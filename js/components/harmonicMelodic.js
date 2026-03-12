/**
 * HMS — Estudo Harmônico Melódico Component
 * Melodia acordal: dois meios-compassos por acorde.
 * Graus relativos à qualidade do acorde (ex: "3" em m7 → 3ª menor; "7" em maj7 → 7ª maior).
 * Exposed via window.HarmonicMelodicComponent
 */
(function () {
    'use strict';

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── Chord-Relative Degree Engine ─────────────────────────────────────────

    function _parseChordName(chordName) {
        const m = String(chordName || '').match(/^([A-G][b#]?)(.*)/);
        if (!m) return { root: 'C', suffix: '' };
        return { root: m[1], suffix: m[2] };
    }

    /**
     * Given a chord suffix, returns a map of bare degree → adjusted degree.
     * Only unaccented degrees (no b/#) will be remapped.
     * Examples:
     *   'm7'      → 3→b3, 7→b7
     *   'maj7'    → 3→3,  7→7
     *   '7'       → 3→3,  7→b7
     *   'm7(b5)'  → 3→b3, 5→b5, 7→b7
     */
    function _chordQualityMap(suffix) {
        const s = String(suffix || '');
        const isMinor   = /^m(?!aj)/i.test(s);
        const isHalfDim = /m7\(b5\)|ø/i.test(s);
        const isDim     = (/°|^dim/i.test(s)) && !isHalfDim;
        const isMaj7    = /maj7|M7/.test(s);
        const hasSeven  = /7/.test(s);
        return {
            '1': '1',
            '2': '2',
            '3': (isMinor || isHalfDim || isDim) ? 'b3' : '3',
            '4': '4',
            '5': (isHalfDim || isDim) ? 'b5' : '5',
            '6': '6',
            '7': isMaj7 ? '7' : hasSeven ? 'b7' : '7',
        };
    }

    /**
     * Normalize a melody string: bare (unaccented) degree numbers are remapped
     * according to the chord's quality. Accented degrees (b3, #4) pass through unchanged.
     */
    function _normalizeForChord(melodyStr, chordName) {
        if (!melodyStr || !melodyStr.trim()) return '';
        const { suffix } = _parseChordName(chordName);
        const qMap = _chordQualityMap(suffix);
        return melodyStr.trim().split(/\s+/).map(tok => {
            const m = tok.match(/^([b#]?)([1-7])((?:\([+-]?\d+\))?(?::\S+)?)$/);
            if (!m) return tok;
            const [, acc, deg, rest] = m;
            if (!acc && qMap[deg]) return qMap[deg] + rest;
            return tok;
        }).join(' ');
    }

    function _chordNoteChips(melodyStr, chordName) {
        const normalized = _normalizeForChord(melodyStr, chordName);
        if (!normalized) return '<span style="color:var(--text-muted);font-size:.75rem;">—</span>';
        try {
            const { root } = _parseChordName(chordName);
            const parsed = window.MelodyEngine.parse(normalized);
            if (!parsed.length) return '<span style="color:var(--text-muted);font-size:.75rem;">—</span>';
            const translated = window.MelodyEngine.translate(parsed, root);
            return translated.map((n, i) => {
                const isRoot = parsed[i]?.deg === '1';
                const color  = isRoot ? 'var(--brand,#7c3aed)' : 'var(--chord-blue,#60a5fa)';
                return `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;margin-right:5px;">
                    <span style="font-family:var(--font-mono);font-size:.78rem;font-weight:600;color:${color};">${esc(n.note)}</span>
                    <span style="font-size:.6rem;color:var(--text-muted);">${esc(n.dur)}</span>
                </span>`;
            }).join('');
        } catch (_) {
            return '<span style="color:var(--chord-amber);font-size:.75rem;">parse error</span>';
        }
    }

    // ── State ────────────────────────────────────────────────────────────────

    const _state = {
        root:          'C',
        isMinor:       false,
        harmonyStr:    '',
        bpm:           80,
        chords:        [],   // string[] — chord names parsed from HarmonyEngine
        halfMeasures:  {},   // { [idx]: { h1: string, h2: string } }
        playing:       null, // null | 'all' | 'c:IDX'
        savingTitle:   '',
        // Studies tab
        tab:           'editor',
        studies:       [],
        currentUserId: null,
    };

    function _getHM(idx) {
        if (!_state.halfMeasures[idx]) _state.halfMeasures[idx] = { h1: '', h2: '' };
        return _state.halfMeasures[idx];
    }

    function _parseHarmony() {
        if (!_state.harmonyStr.trim()) { _state.chords = []; return; }
        try {
            const tokens = window.HarmonyEngine.translate(_state.harmonyStr, _state.root, _state.isMinor);
            _state.chords = tokens.filter(t => t.type === 'CHORD').map(t => t.value);
        } catch (_) {
            _state.chords = [];
        }
    }

    function _buildAllNotes() {
        const allNotes = [];
        for (let i = 0; i < _state.chords.length; i++) {
            const chord = _state.chords[i];
            const { root } = _parseChordName(chord);
            const hm = _getHM(i);
            for (const half of [hm.h1, hm.h2]) {
                if (!half || !half.trim()) continue;
                const norm = _normalizeForChord(half, chord);
                const parsed = window.MelodyEngine.parse(norm);
                const translated = window.MelodyEngine.translate(parsed, root);
                allNotes.push(...translated);
            }
        }
        return allNotes;
    }

    function _buildChordNotes(idx) {
        const chord = _state.chords[idx];
        if (!chord) return [];
        const { root } = _parseChordName(chord);
        const hm = _getHM(idx);
        const allNotes = [];
        for (const half of [hm.h1, hm.h2]) {
            if (!half || !half.trim()) continue;
            const norm = _normalizeForChord(half, chord);
            const parsed = window.MelodyEngine.parse(norm);
            const translated = window.MelodyEngine.translate(parsed, root);
            allNotes.push(...translated);
        }
        return allNotes;
    }

    // ── HTML Builders ────────────────────────────────────────────────────────

    function _chordCardHtml(chord, idx) {
        const hm = _getHM(idx);
        const isPlaying = _state.playing === 'c:' + idx;
        const { suffix } = _parseChordName(chord);

        // Color chord label by quality
        let chordColor = 'var(--chord-blue,#60a5fa)';
        if (/^m(?!aj)/i.test(suffix))                       chordColor = 'var(--brand,#7c3aed)';
        if (/7/.test(suffix) && !/^m/i.test(suffix) && !/maj7|M7/.test(suffix)) chordColor = 'var(--chord-amber,#fbbf24)';
        if (/maj7|M7/.test(suffix))                         chordColor = 'var(--chord-green,#34d399)';

        return `
        <div class="panel" style="margin-bottom:.75rem;" id="hm-card-${idx}">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line-color);">
                <span style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:${chordColor};min-width:80px;">${esc(chord)}</span>
                <span style="font-size:.72rem;color:var(--text-muted);flex:1;">acorde ${idx + 1}</span>
                <button class="btn ${isPlaying ? 'btn-secondary' : 'btn-primary'} hm-play-chord"
                    data-idx="${idx}" style="padding:4px 14px;font-size:.82rem;flex-shrink:0;">
                    <i class="fa-solid fa-${isPlaying ? 'stop' : 'play'}"></i>
                </button>
            </div>
            <div style="padding:10px 14px;display:flex;flex-direction:column;gap:10px;">
                <div>
                    <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">1° meio compasso</div>
                    <input type="text" class="form-input hm-half-input"
                        data-idx="${idx}" data-half="h1"
                        value="${esc(hm.h1)}"
                        placeholder="ex: 1:4n 3:4n 5:4n"
                        style="font-family:var(--font-mono);font-size:.8rem;margin-bottom:4px;" />
                    <div id="hm-chips-${idx}-h1" style="min-height:26px;display:flex;flex-wrap:wrap;align-items:center;gap:2px;">
                        ${_chordNoteChips(hm.h1, chord)}
                    </div>
                </div>
                <div>
                    <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">2° meio compasso</div>
                    <input type="text" class="form-input hm-half-input"
                        data-idx="${idx}" data-half="h2"
                        value="${esc(hm.h2)}"
                        placeholder="ex: 7:4n 5:4n 3:4n 1:4n"
                        style="font-family:var(--font-mono);font-size:.8rem;margin-bottom:4px;" />
                    <div id="hm-chips-${idx}-h2" style="min-height:26px;display:flex;flex-wrap:wrap;align-items:center;gap:2px;">
                        ${_chordNoteChips(hm.h2, chord)}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _keyOptions() {
        const current = _state.root + (_state.isMinor ? 'm' : '');
        return window.HarmonyEngine.allKeys().map(k =>
            `<option value="${k.value}" ${k.value === current ? 'selected' : ''}>${esc(k.label)}</option>`
        ).join('');
    }

    function _editorHtml() {
        const hasChords = _state.chords.length > 0;
        return `
            <div class="page-header">
                <div class="page-title">
                    <div class="page-title-icon"><i class="fa-solid fa-guitar"></i></div>
                    <div>
                        <h2>Estudo Harmônico Melódico</h2>
                        <p>Dois meios-compassos por acorde — graus relativos à qualidade</p>
                    </div>
                </div>
            </div>

            <!-- Toolbar -->
            <div class="panel" style="margin-bottom:1.25rem;padding:12px 14px;">
                <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.78rem;color:var(--text-muted);">Tom</label>
                        <select class="form-select" id="hm-key-select" style="width:auto;">${_keyOptions()}</select>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:200px;">
                        <label style="font-size:.78rem;color:var(--text-muted);white-space:nowrap;">Harmonia</label>
                        <input type="text" class="form-input" id="hm-harmony-input"
                            value="${esc(_state.harmonyStr)}"
                            placeholder="ex: Im7 IVm7 bVII7 III7"
                            style="flex:1;font-family:var(--font-mono);" />
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.78rem;color:var(--text-muted);">BPM</label>
                        <input type="number" class="form-input" id="hm-bpm"
                            value="${_state.bpm}" min="20" max="300"
                            style="width:68px;text-align:center;" />
                    </div>
                    <button class="btn ${_state.playing === 'all' ? 'btn-secondary' : 'btn-primary'}" id="hm-play-all" style="flex-shrink:0;">
                        <i class="fa-solid fa-${_state.playing === 'all' ? 'stop' : 'play'}"></i>
                        ${_state.playing === 'all' ? 'Parar' : 'Tocar Tudo'}
                    </button>
                </div>
            </div>

            <!-- Hint -->
            <div style="font-size:.73rem;color:var(--text-muted);margin-bottom:1rem;padding:7px 10px;
                background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                <strong>Graus relativos ao acorde</strong>
                · Sem acidente: adapta-se à qualidade
                (ex: <code style="font-family:var(--font-mono);">3</code> em m7 → 3ª menor;
                <code style="font-family:var(--font-mono);">7</code> em maj7 → 7ª maior)
                · Com acidente <code style="font-family:var(--font-mono);">(b3, #4)</code>: intervalo absoluto da raiz
                · Formato: <code style="font-family:var(--font-mono);">grau(oitava):duração</code>
                &nbsp;·&nbsp; <span style="color:var(--brand);">●</span> tônica
                <span style="color:var(--chord-blue);margin-left:4px;">●</span> outros
            </div>

            <!-- Chord cards -->
            <div id="hm-chord-list">
                ${hasChords
                    ? _state.chords.map((c, i) => _chordCardHtml(c, i)).join('')
                    : `<div style="text-align:center;padding:2.5rem;color:var(--text-muted);">
                        <i class="fa-solid fa-music" style="font-size:1.6rem;opacity:.3;display:block;margin-bottom:.75rem;"></i>
                        Digite a harmonia funcional e os acordes aparecerão aqui.
                       </div>`}
            </div>

            <!-- Save bar -->
            <div id="hm-save-bar" class="panel"
                style="padding:10px 14px;display:${hasChords ? 'flex' : 'none'};gap:8px;align-items:center;margin-top:.75rem;">
                <input type="text" class="form-input" id="hm-save-title"
                    placeholder="Título para salvar este estudo…"
                    value="${esc(_state.savingTitle)}"
                    style="flex:1;" />
                <button class="btn btn-primary" id="hm-btn-save">
                    <i class="fa-solid fa-floppy-disk"></i> Salvar
                </button>
            </div>
        `;
    }

    // ── Component ─────────────────────────────────────────────────────────────

    const HarmonicMelodicComponent = {

        render() {
            const C = HarmonicMelodicComponent;
            const content = document.getElementById('main-content');
            const tabStyle = (active) =>
                `padding:7px 18px;border-radius:var(--radius-sm,6px);font-size:.85rem;cursor:pointer;` +
                `font-weight:${active ? '600' : '400'};` +
                `background:${active ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--glass-bg,rgba(255,255,255,.04))'};` +
                `border:1px solid ${active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))'};` +
                `color:${active ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};`;

            content.innerHTML = `
                <div style="display:flex;gap:8px;margin-bottom:1.25rem;">
                    <button class="hm-tab" data-tab="editor" style="${tabStyle(_state.tab === 'editor')}">
                        <i class="fa-solid fa-pen-to-square"></i> Editor
                    </button>
                    <button class="hm-tab" data-tab="studies" style="${tabStyle(_state.tab === 'studies')}">
                        <i class="fa-solid fa-folder-open"></i> Estudos Salvos
                    </button>
                </div>
                <div id="hm-tab-content"></div>
            `;

            document.querySelectorAll('.hm-tab').forEach(btn => {
                btn.addEventListener('click', e => {
                    _state.tab = e.currentTarget.dataset.tab;
                    C.render();
                });
            });

            if (_state.tab === 'editor') C._renderEditor();
            else C._renderStudies();
        },

        // ── Editor tab ───────────────────────────────────────────────────────

        _renderEditor() {
            const C = HarmonicMelodicComponent;
            document.getElementById('hm-tab-content').innerHTML = _editorHtml();
            C._bindEditorEvents();
        },

        _bindEditorEvents() {
            const C = HarmonicMelodicComponent;

            // Key select
            document.getElementById('hm-key-select')?.addEventListener('change', e => {
                const val = e.target.value;
                if (val.endsWith('m')) {
                    _state.root    = val.slice(0, -1);
                    _state.isMinor = true;
                } else {
                    _state.root    = val;
                    _state.isMinor = false;
                }
                _parseHarmony();
                C._renderEditor();
            });

            // Harmony input — surgical update, preserve focus
            document.getElementById('hm-harmony-input')?.addEventListener('input', e => {
                _state.harmonyStr = e.target.value;
                _parseHarmony();
                C._refreshChordList();
            });

            // BPM
            document.getElementById('hm-bpm')?.addEventListener('change', e => {
                _state.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _state.bpm;
            });

            // Play all
            document.getElementById('hm-play-all')?.addEventListener('click', () => C._togglePlayAll());

            // Half-measure inputs — event delegation on chord list
            const cardList = document.getElementById('hm-chord-list');
            cardList?.addEventListener('input', e => {
                const inp = e.target.closest('.hm-half-input');
                if (!inp) return;
                const idx   = parseInt(inp.dataset.idx);
                const half  = inp.dataset.half;
                const chord = _state.chords[idx];
                if (!chord) return;
                _getHM(idx)[half] = inp.value;
                const el = document.getElementById(`hm-chips-${idx}-${half}`);
                if (el) el.innerHTML = _chordNoteChips(inp.value, chord);
            });

            // Play chord — event delegation
            cardList?.addEventListener('click', e => {
                const btn = e.target.closest('.hm-play-chord');
                if (btn) C._togglePlayChord(parseInt(btn.dataset.idx));
            });

            // Save
            document.getElementById('hm-save-title')?.addEventListener('input', e => {
                _state.savingTitle = e.target.value;
            });
            document.getElementById('hm-btn-save')?.addEventListener('click', () => C._saveStudy());
        },

        _refreshChordList() {
            const listEl    = document.getElementById('hm-chord-list');
            const saveBarEl = document.getElementById('hm-save-bar');
            if (!listEl) return;

            const hasChords = _state.chords.length > 0;

            listEl.innerHTML = hasChords
                ? _state.chords.map((c, i) => _chordCardHtml(c, i)).join('')
                : `<div style="text-align:center;padding:2.5rem;color:var(--text-muted);">
                    <i class="fa-solid fa-music" style="font-size:1.6rem;opacity:.3;display:block;margin-bottom:.75rem;"></i>
                    Digite a harmonia funcional e os acordes aparecerão aqui.
                   </div>`;

            if (saveBarEl) saveBarEl.style.display = hasChords ? 'flex' : 'none';
        },

        // ── Playback ─────────────────────────────────────────────────────────

        _stopAll() {
            const C = HarmonicMelodicComponent;
            if (!_state.playing) return;
            window.HMSAudio.stop();
            const prev = _state.playing;
            _state.playing = null;
            if (prev === 'all') C._updatePlayAllBtn();
            else C._updateChordPlayBtn(prev, false);
        },

        _togglePlayAll() {
            const C = HarmonicMelodicComponent;
            if (_state.playing) {
                C._stopAll();
                return;
            }
            const notes = _buildAllNotes();
            if (!notes.length) { window.HMSApp.showToast('Nenhuma melodia para tocar.', 'warning'); return; }
            _state.playing = 'all';
            C._updatePlayAllBtn();
            window.HMSAudio.playMelody(notes, _state.bpm, () => {
                _state.playing = null;
                C._updatePlayAllBtn();
            });
        },

        _updatePlayAllBtn() {
            const btn = document.getElementById('hm-play-all');
            if (!btn) return;
            const playing = _state.playing === 'all';
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'play'}"></i> ${playing ? 'Parar' : 'Tocar Tudo'}`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-primary'}`;
        },

        _togglePlayChord(idx) {
            const C   = HarmonicMelodicComponent;
            const key = 'c:' + idx;
            if (_state.playing) {
                const prev = _state.playing;
                C._stopAll();
                if (prev === key) return;
            }
            const notes = _buildChordNotes(idx);
            if (!notes.length) { window.HMSApp.showToast('Nenhuma nota neste acorde.', 'warning'); return; }
            _state.playing = key;
            C._updateChordPlayBtn(key, true);
            window.HMSAudio.playMelody(notes, _state.bpm, () => {
                _state.playing = null;
                C._updateChordPlayBtn(key, false);
            });
        },

        _updateChordPlayBtn(key, playing) {
            if (!key || !key.startsWith('c:')) return;
            const idx = parseInt(key.slice(2));
            const btn = document.querySelector(`.hm-play-chord[data-idx="${idx}"]`);
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${playing ? 'stop' : 'play'}"></i>`;
            btn.className = `btn ${playing ? 'btn-secondary' : 'btn-primary'} hm-play-chord`;
        },

        // ── Studies tab ──────────────────────────────────────────────────────

        _renderStudies() {
            const C = HarmonicMelodicComponent;
            document.getElementById('hm-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-folder-open"></i></div>
                        <div>
                            <h2>Estudos Harmônicos Salvos</h2>
                            <p>Progressões com melodia acordal — carregue para editar</p>
                        </div>
                    </div>
                </div>
                <div id="hm-studies-list">
                    <div style="text-align:center;padding:2rem;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-spin"></i> Carregando…
                    </div>
                </div>
            `;

            document.getElementById('hm-studies-list').addEventListener('click', e => {
                const loadBtn = e.target.closest('.hm-load-study');
                const delBtn  = e.target.closest('.hm-del-study');
                if (loadBtn) C._loadStudy(loadBtn.dataset.id);
                if (delBtn)  C._deleteStudy(delBtn.dataset.id);
            });

            C._loadStudies();
        },

        _loadStudies: async function () {
            const C = HarmonicMelodicComponent;
            try {
                const user = await window.HMSAuth.currentUser();
                _state.currentUserId = user?.id || null;
                _state.studies = await window.HMSAPI.HarmonicStudies.getAll();
            } catch (_e) {
                window.HMSApp.showToast('Erro ao carregar estudos.', 'error');
                _state.studies = [];
            }
            C._renderStudiesList();
        },

        _renderStudiesList() {
            const listEl = document.getElementById('hm-studies-list');
            if (!listEl) return;
            if (!_state.studies.length) {
                listEl.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                        <i class="fa-solid fa-music" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.75rem;"></i>
                        Nenhum estudo salvo ainda.
                    </div>`;
                return;
            }
            const isOwner = id => _state.studies.find(s => s.id === id)?.user_id === _state.currentUserId;
            listEl.innerHTML = _state.studies.map(s => {
                const keyLabel = s.root + (s.is_minor ? 'm' : '') + ' ' + (s.is_minor ? 'Menor' : 'Maior');
                return `
                <div class="panel" style="margin-bottom:.75rem;">
                    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;">
                        <div style="flex:1;min-width:0;">
                            <span style="font-size:.9rem;font-weight:600;color:var(--text-primary);">${esc(s.title)}</span>
                            <span style="font-size:.75rem;color:var(--text-muted);margin-left:10px;font-family:var(--font-mono);">${esc(s.harmony)}</span>
                        </div>
                        <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${esc(keyLabel)} · ${s.bpm || 80} BPM</span>
                        <button class="btn btn-primary hm-load-study" data-id="${esc(s.id)}"
                            style="padding:4px 14px;font-size:.82rem;flex-shrink:0;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Carregar
                        </button>
                        ${isOwner(s.id) ? `
                        <button class="btn btn-ghost hm-del-study" data-id="${esc(s.id)}"
                            style="padding:4px 10px;font-size:.82rem;flex-shrink:0;color:var(--chord-red,#f87171);" title="Deletar">
                            <i class="fa-solid fa-trash"></i>
                        </button>` : ''}
                    </div>
                </div>`;
            }).join('');
        },

        _loadStudy(id) {
            const C     = HarmonicMelodicComponent;
            const study = _state.studies.find(s => s.id === id);
            if (!study) return;
            _state.root          = study.root || 'C';
            _state.isMinor       = !!study.is_minor;
            _state.harmonyStr    = study.harmony || '';
            _state.bpm           = study.bpm || 80;
            _state.savingTitle   = study.title || '';
            _state.halfMeasures  = {};
            const hms = Array.isArray(study.half_measures) ? study.half_measures : [];
            hms.forEach((hm, i) => {
                _state.halfMeasures[i] = { h1: hm.h1 || '', h2: hm.h2 || '' };
            });
            _parseHarmony();
            _state.tab = 'editor';
            C.render();
            window.HMSApp.showToast(`"${study.title}" carregado.`, 'success');
        },

        _saveStudy: async function () {
            const title = (_state.savingTitle || '').trim();
            if (!title)                   { window.HMSApp.showToast('Informe um título.', 'warning');  return; }
            if (!_state.harmonyStr.trim()) { window.HMSApp.showToast('Harmonia vazia.', 'warning');    return; }
            const halfMeasures = _state.chords.map((_, i) => ({
                h1: _getHM(i).h1,
                h2: _getHM(i).h2,
            }));
            try {
                await window.HMSAPI.HarmonicStudies.create({
                    title,
                    root:          _state.root,
                    is_minor:      _state.isMinor,
                    harmony:       _state.harmonyStr,
                    bpm:           _state.bpm,
                    half_measures: halfMeasures,
                });
                window.HMSApp.showToast('Estudo salvo!', 'success');
                _state.savingTitle = '';
                const titleEl = document.getElementById('hm-save-title');
                if (titleEl) titleEl.value = '';
            } catch (e) {
                window.HMSApp.showToast('Erro ao salvar: ' + (e.message || e), 'error');
            }
        },

        _deleteStudy: async function (id) {
            if (!confirm('Deletar este estudo?')) return;
            try {
                await window.HMSAPI.HarmonicStudies.delete(id);
                _state.studies = _state.studies.filter(s => s.id !== id);
                HarmonicMelodicComponent._renderStudiesList();
                window.HMSApp.showToast('Estudo removido.', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao deletar: ' + (e.message || e), 'error');
            }
        },
    };

    window.HarmonicMelodicComponent = HarmonicMelodicComponent;
    console.info('[HMS] HarmonicMelodicComponent loaded.');
})();
