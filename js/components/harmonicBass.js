/**
 * HMS — Condução de Baixo
 * T1/T2: um grau por tempo (condução clássica) · B1/B2: até 4 graus por tempo (subdivisão).
 * Playback: T1→T2 por acorde; B1/B2 com subdivisão de tempo (colcheia/tercina/semicolcheia).
 * Notas no registro grave (violão de 7 cordas) para B1/B2.
 * Exposed via window.HarmonicBassComponent
 */
(function () {
    'use strict';

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── Grau → letra da nota ──────────────────────────────────────────────────
    const _NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const _FLAT_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

    function _parseChordName(c) {
        const m = String(c || '').match(/^([A-G][b#]?)(.*)/);
        return m ? { root: m[1], suffix: m[2] } : { root: 'C', suffix: '' };
    }

    function _chordQualityMap(suffix) {
        const s = String(suffix || '');
        const isMinor   = /^m(?!aj)/i.test(s);
        const isHalfDim = /m7\(b5\)|ø/i.test(s);
        const isDim     = (/°|^dim/i.test(s)) && !isHalfDim;
        const isMaj7    = /maj7|M7/.test(s);
        const hasSeven  = /7/.test(s);
        return {
            '1':'1','2':'2',
            '3': (isMinor||isHalfDim||isDim) ? 'b3' : '3',
            '4':'4',
            '5': (isHalfDim||isDim) ? 'b5' : '5',
            '6':'6',
            '7': isMaj7 ? '7' : hasSeven ? 'b7' : '7',
        };
    }

    const DEG_ST = {
        '1':0,'b2':1,'#1':1,'2':2,'b3':3,'#2':3,'3':4,'b4':4,
        '4':5,'#4':6,'b5':6,'5':7,'#5':8,'b6':8,'6':9,'b7':10,'#6':10,'7':11,
    };

    function _normalizeDeg(deg, chordName) {
        const { suffix } = _parseChordName(chordName);
        const qMap = _chordQualityMap(suffix);
        const m = deg.match(/^([b#]?)([1-7])$/);
        if (!m) return deg;
        return (!m[1] && qMap[m[2]]) ? qMap[m[2]] : deg;
    }

    function _degToLetter(rawDeg, chordName) {
        if (!rawDeg || !rawDeg.trim()) return '';
        const deg = _normalizeDeg(rawDeg.trim(), chordName);
        const { root } = _parseChordName(chordName);
        const rootIdx     = _NOTE_NAMES.indexOf(root);
        const rootIdxFlat = _FLAT_NAMES.indexOf(root);
        const ri  = rootIdx >= 0 ? rootIdx : (rootIdxFlat >= 0 ? rootIdxFlat : 0);
        const st  = DEG_ST[deg] ?? 0;
        const idx = (ri + st) % 12;
        const useFlatKey = ['F','Bb','Eb','Ab','Db','Gb'].includes(root) || deg.startsWith('b');
        return useFlatKey ? _FLAT_NAMES[idx] : _NOTE_NAMES[idx];
    }

    function _degToNote(rawDeg, chordName) {
        if (!rawDeg || !rawDeg.trim()) return null;
        try {
            const deg = _normalizeDeg(rawDeg.trim(), chordName);
            const { root } = _parseChordName(chordName);
            const result = window.MelodyEngine.translate([{ deg, oct: 0, dur: '4n' }], root);
            return result.length ? result[0].note : null;
        } catch (_) { return null; }
    }

    function _degToNote7str(rawDeg, chordName) {
        // Bass register: oct -2 (7-string guitar range)
        if (!rawDeg || rawDeg === '-' || !rawDeg.trim()) return null;
        try {
            const deg = _normalizeDeg(rawDeg.trim(), chordName);
            const { root } = _parseChordName(chordName);
            const result = window.MelodyEngine.translate([{ deg, oct: -2, dur: '4n' }], root);
            return result.length ? result[0].note : null;
        } catch (_) { return null; }
    }

    // ── Parse up to 4 degree tokens from a space-separated string ────────────
    function _parseDegs(str) {
        return (str || '').trim().split(/\s+/).filter(s => s.length > 0).slice(0, 4);
    }

    // ── Subdivide slot duration by note count ─────────────────────────────────
    function _subdivDur(baseDur, count) {
        if (count <= 1) return baseDur;
        const splits = {
            '1n':  { 2:'2n',  3:'2t',  4:'4n'   },
            '2n':  { 2:'4n',  3:'4t',  4:'8n'   },
            '4n':  { 2:'8n',  3:'8t',  4:'16n'  },
            '4n.': { 2:'8n.', 3:'8n',  4:'16n.' },
            '8n':  { 2:'16n', 3:'16t', 4:'32n'  },
        };
        return splits[baseDur]?.[count] ?? baseDur;
    }

    // ── Duration per slot based on time signature ─────────────────────────────
    function _slotDur() {
        const [num] = _st.timeSig.split('/').map(Number);
        if (num === 2) return '4n';
        if (num === 4) return '2n';
        if (num === 3) return '4n.';
        if (num === 6) return '4n.';
        return '4n';
    }

    function _durToMs(dur, bpm) {
        const b = 60000 / bpm;
        const map = {
            '1n':b*4, '2n':b*2, '4n':b, '4n.':b*1.5, '8n':b/2, '8n.':b*.75,
            '16n':b/4, '16n.':b*.375, '32n':b/8,
            '2t':b*4/3, '4t':b*2/3, '8t':b/3, '16t':b/6,
        };
        return map[dur] ?? b;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    const _st = {
        root:          'G',
        isMinor:       false,
        harmonyStr:    '',
        bpm:           80,
        timeSig:       '2/4',
        instrument:    'guitar',   // 'guitar' | 'cavaco' | 'basic'
        chords:        [],
        slots:         [],   // [{n1,n2,b1,b2}, ...] — one per chord
        playingCi:     null,
        playingCol:    null,   // 0/1 for B1/B2
        playingDeg:    null,   // index within B col
        playing:       false,
        playTimers:    [],
        tab:           'studies',
        studies:       [],
        currentUserId: null,
        savingTitle:   '',
    };


    function _ensureSlots() {
        while (_st.slots.length < _st.chords.length) _st.slots.push({ n1:'1', n2:'5', b1:'', b2:'' });
        _st.slots.length = _st.chords.length;
    }

    function _parseHarmony() {
        if (!_st.harmonyStr.trim()) { _st.chords = []; return; }
        try {
            const tokens = window.HarmonyEngine.translate(_st.harmonyStr, _st.root, _st.isMinor);
            _st.chords = tokens.filter(t => t.type === 'CHORD').map(t => t.value);
        } catch (_) { _st.chords = []; }
    }

    function _chordColor(chord) {
        const s = String(chord || '');
        if (s.includes('°') || s.toLowerCase().includes('dim')) return 'var(--chord-red,#f87171)';
        if (/m(?!aj)/i.test(s.replace(/^[A-G][b#]?/,''))) return 'var(--chord-blue,#60a5fa)';
        if (s.includes('7')) return 'var(--chord-amber,#fbbf24)';
        return 'var(--chord-green,#34d399)';
    }

    // ── Note row HTML for B1/B2 multi-degree column ───────────────────────────
    function _noteRowHtml(degs, chord, ci, colIdx) {
        if (!degs.length) return `<div style="min-height:18px;"></div>`;
        const cells = degs.map((deg, di) => {
            const isSil  = deg === '-';
            const letter = isSil ? '—' : (_degToLetter(deg, chord) || '?');
            const isPlay = _st.playingCi === ci && _st.playingCol === colIdx && _st.playingDeg === di;
            return `<span id="hb-note-${ci}-${colIdx}-${di}"
                style="font-size:.65rem;font-weight:700;font-family:var(--font-mono);
                color:${isPlay ? '#fff' : isSil ? 'var(--text-muted)' : 'var(--chord-blue,#60a5fa)'};
                background:${isPlay ? 'var(--brand,#7c3aed)' : 'transparent'};
                border-radius:3px;padding:1px 3px;min-width:15px;text-align:center;
                transition:background .15s,color .15s;">${esc(letter)}</span>`;
        }).join('');
        return `<div style="display:flex;gap:2px;justify-content:center;flex-wrap:nowrap;">${cells}</div>`;
    }

    // ── Chord Card HTML (B1/B2 only) ──────────────────────────────────────────
    function _cardHtml(chord, ci) {
        const slot    = _st.slots[ci] || { b1:'', b2:'' };
        const color   = _chordColor(chord);
        const degs1   = _parseDegs(slot.b1);
        const degs2   = _parseDegs(slot.b2);
        const isActive = _st.playingCi === ci;

        const border  = isActive ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
        const shadow  = isActive ? '0 0 14px rgba(124,58,237,.4)' : 'none';

        const inputStyle =
            `width:100%;box-sizing:border-box;text-align:center;background:var(--bg-raised);` +
            `border:1px solid var(--glass-border);border-radius:3px;outline:none;` +
            `font-family:var(--font-mono);font-size:.65rem;font-weight:600;` +
            `color:var(--text-primary);padding:2px 2px;margin-bottom:3px;`;

        return `
        <div class="hb-card" data-ci="${ci}"
            style="flex-shrink:0;min-width:100px;max-width:150px;border-radius:8px;
            border:2px solid ${border};
            box-shadow:${shadow};
            background:var(--bg-surface);overflow:hidden;
            transition:border-color .18s,box-shadow .18s;">

            <!-- Header -->
            <div style="padding:4px 6px 3px;display:flex;align-items:center;gap:4px;
                border-bottom:1px solid var(--line-color);background:var(--bg-raised);">
                <span style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:${color};">${esc(chord)}</span>
                <span style="flex:1;"></span>
                <button class="hb-play-chord btn btn-ghost" data-ci="${ci}"
                    style="padding:0px 5px;font-size:.6rem;">
                    <i class="fa-solid fa-play"></i>
                </button>
            </div>

            <!-- B1 / B2 row -->
            <div style="display:flex;align-items:stretch;gap:0;">
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                    padding:4px 4px 5px;border-right:1px solid var(--line-color);">
                    <input class="hb-bass-input" data-ci="${ci}" data-col="0"
                        value="${esc(slot.b1)}" placeholder="1 5"
                        style="${inputStyle}" />
                    ${_noteRowHtml(degs1, chord, ci, 0)}
                </div>
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                    padding:4px 4px 5px;">
                    <input class="hb-bass-input" data-ci="${ci}" data-col="1"
                        value="${esc(slot.b2)}" placeholder="—"
                        style="${inputStyle}" />
                    ${_noteRowHtml(degs2, chord, ci, 1)}
                </div>
            </div>
        </div>`;
    }

    // ── Key options ───────────────────────────────────────────────────────────
    function _keyOptions() {
        const cur = _st.root + (_st.isMinor ? 'm' : '');
        return window.HarmonyEngine.allKeys().map(k =>
            `<option value="${k.value}" ${k.value === cur ? 'selected' : ''}>${esc(k.label)}</option>`
        ).join('');
    }

    // ── Editor HTML ───────────────────────────────────────────────────────────
    function _editorHtml() {
        _ensureSlots();
        const hasChords = _st.chords.length > 0;
        const chordsHtml = hasChords
            ? _st.chords.map((c, i) => _cardHtml(c, i)).join('')
            : `<div style="padding:2rem;color:var(--text-muted);white-space:nowrap;">
                <i class="fa-solid fa-music" style="font-size:1.4rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>
                Digite a harmonia acima.</div>`;

        return `
            <div class="page-header">
                <div class="page-title">
                    <div class="page-title-icon"><i class="fa-solid fa-bass-guitar"></i></div>
                    <div>
                        <h2>Condução de Baixo</h2>
                        <p>Até 4 notas por meio compasso · Baixo de 7 cordas</p>
                    </div>
                </div>
            </div>

            <!-- Toolbar -->
            <div class="panel" style="margin-bottom:.75rem;padding:10px 14px;">
                <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">Tom</label>
                        <select class="form-select" id="hb-key-select" style="width:auto;">${_keyOptions()}</select>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:180px;">
                        <label style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;">Harmonia</label>
                        <input type="text" class="form-input" id="hb-harmony-input"
                            value="${esc(_st.harmonyStr)}"
                            placeholder="ex: 1 4 5 1"
                            style="flex:1;font-family:var(--font-mono);" />
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">BPM</label>
                        <input type="number" class="form-input" id="hb-bpm"
                            value="${_st.bpm}" min="20" max="300" style="width:64px;text-align:center;" />
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">Compasso</label>
                        <select class="form-select" id="hb-timesig-select" style="width:auto;">
                            <option value="2/4" ${_st.timeSig === '2/4' ? 'selected' : ''}>2/4</option>
                            <option value="3/4" ${_st.timeSig === '3/4' ? 'selected' : ''}>3/4</option>
                            <option value="4/4" ${_st.timeSig === '4/4' ? 'selected' : ''}>4/4</option>
                            <option value="6/8" ${_st.timeSig === '6/8' ? 'selected' : ''}>6/8</option>
                        </select>
                    </div>
                    <!-- Instrument selector -->
                    <div style="display:flex;gap:4px;">
                        ${['guitar','cavaco','basic'].map(inst => {
                            const labels = {guitar:'Violão', cavaco:'Cavaco', basic:'Synth'};
                            const active = _st.instrument === inst;
                            return `<button class="hb-inst-btn btn btn-ghost" data-inst="${inst}"
                                style="padding:3px 10px;font-size:.72rem;
                                background:${active ? 'var(--brand-dim,rgba(124,58,237,.12))' : ''};
                                border-color:${active ? 'var(--brand,#7c3aed)' : 'var(--glass-border)'};
                                color:${active ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};
                                font-weight:${active ? '700' : '400'};">${labels[inst]}</button>`;
                        }).join('')}
                    </div>
                    <button class="btn ${_st.playing ? 'btn-secondary' : 'btn-primary'}" id="hb-play-btn">
                        <i class="fa-solid fa-${_st.playing ? 'stop' : 'play'}"></i>
                        ${_st.playing ? 'Parar' : 'Tocar Baixo'}
                    </button>
                    <button class="btn btn-ghost" id="hb-guitar-btn"
                        style="border-color:var(--chord-green,#34d399);color:var(--chord-green,#34d399);">
                        <i class="fa-solid fa-guitar"></i> Tocar Acordes
                    </button>
                </div>
            </div>

            <!-- Hint -->
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.75rem;padding:5px 10px;
                background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                B1/B2: graus separados por espaço · ex: <code>1 5</code> <code>1 b3 5 1</code> ·
                Use <code>-</code> para silêncio · 2=colcheias · 3=tercinas · 4=semicolcheias · Tab=próximo
            </div>

            <!-- Chord grid -->
            <div id="hb-chord-grid"
                style="display:flex;flex-wrap:wrap;gap:6px;padding-bottom:6px;margin-bottom:.75rem;
                align-items:flex-start;">
                ${chordsHtml}
            </div>

            <!-- Save bar -->
            <div id="hb-save-bar" class="panel"
                style="padding:10px 14px;display:${hasChords ? 'flex' : 'none'};gap:8px;align-items:center;">
                <input type="text" class="form-input" id="hb-save-title"
                    placeholder="Título para salvar este estudo…"
                    value="${esc(_st.savingTitle)}" style="flex:1;" />
                <button class="btn btn-primary" id="hb-btn-save">
                    <i class="fa-solid fa-floppy-disk"></i> Salvar
                </button>
            </div>
        `;
    }

    // ── Component ─────────────────────────────────────────────────────────────
    const C = {

        // Chamado pelo SPA ao navegar para este módulo — sempre abre em Estudos Salvos
        render() {
            _st.tab = 'studies';
            C._render();
        },

        _render() {
            const content = document.getElementById('main-content');
            const ts = (active) =>
                `padding:7px 18px;border-radius:var(--radius-sm,6px);font-size:.85rem;cursor:pointer;` +
                `font-weight:${active ? '600' : '400'};` +
                `background:${active ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--glass-bg,rgba(255,255,255,.04))'};` +
                `border:1px solid ${active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))'};` +
                `color:${active ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};`;

            content.innerHTML = `
                <div style="display:flex;gap:8px;margin-bottom:1.25rem;">
                    <button class="hb-tab" data-tab="editor" style="${ts(_st.tab === 'editor')}">
                        <i class="fa-solid fa-pen-to-square"></i> Editor
                    </button>
                    <button class="hb-tab" data-tab="studies" style="${ts(_st.tab === 'studies')}">
                        <i class="fa-solid fa-folder-open"></i> Estudos Salvos
                    </button>
                </div>
                <div id="hb-tab-content"></div>
            `;

            document.querySelectorAll('.hb-tab').forEach(btn => {
                btn.addEventListener('click', e => { _st.tab = e.currentTarget.dataset.tab; C._render(); });
            });

            if (_st.tab === 'editor') C._renderEditor();
            else C._renderStudies();
        },

        // ── Editor ───────────────────────────────────────────────────────────

        _renderEditor() {
            document.getElementById('hb-tab-content').innerHTML = _editorHtml();
            C._bindEditorEvents();
        },

        _bindEditorEvents() {
            document.getElementById('hb-key-select')?.addEventListener('change', e => {
                const v = e.target.value;
                _st.root    = v.endsWith('m') ? v.slice(0, -1) : v;
                _st.isMinor = v.endsWith('m');
                _parseHarmony();
                C._renderEditor();
            });

            document.getElementById('hb-harmony-input')?.addEventListener('input', e => {
                _st.harmonyStr = e.target.value;
                _parseHarmony();
                C._refreshGrid();
            });

            document.getElementById('hb-bpm')?.addEventListener('change', e => {
                _st.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _st.bpm;
            });

            document.getElementById('hb-timesig-select')?.addEventListener('change', e => {
                _st.timeSig = e.target.value;
            });

            document.getElementById('hb-play-btn')?.addEventListener('click', () => C._togglePlay());
            document.getElementById('hb-guitar-btn')?.addEventListener('click', () => C._toggleGuitarPlay());

            // Instrument selector
            document.getElementById('hb-tab-content')?.addEventListener('click', e => {
                const instBtn = e.target.closest('.hb-inst-btn');
                if (instBtn) {
                    _st.instrument = instBtn.dataset.inst;
                    document.querySelectorAll('.hb-inst-btn').forEach(b => {
                        const on = b.dataset.inst === _st.instrument;
                        b.style.background   = on ? 'var(--brand-dim,rgba(124,58,237,.12))' : '';
                        b.style.borderColor  = on ? 'var(--brand,#7c3aed)' : 'var(--glass-border)';
                        b.style.color        = on ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)';
                        b.style.fontWeight   = on ? '700' : '400';
                    });
                }
            });

            const grid = document.getElementById('hb-chord-grid');

            // B1/B2 inputs
            grid?.addEventListener('input', e => {
                const bass = e.target.closest('.hb-bass-input');
                if (bass) {
                    const ci  = +bass.dataset.ci;
                    const col = +bass.dataset.col;
                    _ensureSlots();
                    if (col === 0) _st.slots[ci].b1 = bass.value;
                    else           _st.slots[ci].b2 = bass.value;
                    C._refreshNoteRow(ci, col);
                }
            });

            grid?.addEventListener('keydown', e => {
                const bass = e.target.closest('.hb-bass-input');
                if (!bass || e.key !== 'Tab') return;
                e.preventDefault();
                const ci   = +bass.dataset.ci;
                const col  = +bass.dataset.col;
                const next = col === 0 ? 1 : 0;
                document.querySelector(`.hb-bass-input[data-ci="${ci}"][data-col="${next}"]`)?.focus();
            });

            grid?.addEventListener('click', e => {
                const btn = e.target.closest('.hb-play-chord');
                if (btn) C._playChord(+btn.dataset.ci);
            });

            document.getElementById('hb-save-title')?.addEventListener('input', e => {
                _st.savingTitle = e.target.value;
            });
            document.getElementById('hb-btn-save')?.addEventListener('click', () => C._saveStudy());
        },

        _refreshGrid() {
            const gridEl  = document.getElementById('hb-chord-grid');
            const saveBar = document.getElementById('hb-save-bar');
            if (!gridEl) return;
            _ensureSlots();
            const hasChords = _st.chords.length > 0;
            gridEl.innerHTML = hasChords
                ? _st.chords.map((c, i) => _cardHtml(c, i)).join('')
                : `<div style="padding:2rem;color:var(--text-muted);white-space:nowrap;">
                    <i class="fa-solid fa-music" style="font-size:1.4rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>
                    Digite a harmonia acima.</div>`;
            if (saveBar) saveBar.style.display = hasChords ? 'flex' : 'none';
        },

        // ── Card-level glow highlight ─────────────────────────────────────────
        _setCardActive(ci) {
            document.querySelectorAll('.hb-card').forEach(card => {
                const on = ci !== null && +card.dataset.ci === ci;
                card.style.borderColor = on ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
                card.style.boxShadow   = on ? '0 0 14px rgba(124,58,237,.4)' : 'none';
            });
        },

        _refreshNoteRow(ci, col) {
            const chord = _st.chords[ci];
            if (!chord) return;
            const slot = _st.slots[ci];
            if (!slot) return;
            const degs = _parseDegs(col === 0 ? slot.b1 : slot.b2);
            const inp  = document.querySelector(`.hb-bass-input[data-ci="${ci}"][data-col="${col}"]`);
            if (!inp) return;
            const row = inp.nextElementSibling;
            if (row) row.outerHTML = _noteRowHtml(degs, chord, ci, col);
        },



        // ── Note / Card highlight ─────────────────────────────────────────────

        _clearBassHighlight() {
            if (_st.playingCi !== null && _st.playingCol !== null && _st.playingDeg !== null) {
                const el = document.getElementById(`hb-note-${_st.playingCi}-${_st.playingCol}-${_st.playingDeg}`);
                if (el) { el.style.background = 'transparent'; el.style.color = 'var(--chord-blue,#60a5fa)'; }
            }
            _st.playingCi = null; _st.playingCol = null; _st.playingDeg = null;
        },

        _activateBassHighlight(ci, col, deg) {
            C._clearBassHighlight();
            _st.playingCi = ci; _st.playingCol = col; _st.playingDeg = deg;
            const el = document.getElementById(`hb-note-${ci}-${col}-${deg}`);
            if (el) { el.style.background = 'var(--brand,#7c3aed)'; el.style.color = '#fff'; }
        },

        // ── Playback ─────────────────────────────────────────────────────────

        _clearTimers() {
            _st.playTimers.forEach(clearTimeout);
            _st.playTimers = [];
        },

        _stopAll() {
            window.HMSAudio.stop();
            C._clearTimers();
            C._clearBassHighlight();
            C._setCardActive(null);
            _st.playing   = false;
            _st.playingCi = null;
            const btn1 = document.getElementById('hb-play-btn');
            if (btn1) { btn1.innerHTML = '<i class="fa-solid fa-play"></i> Tocar Baixo'; btn1.className = 'btn btn-primary'; }
            const btn2 = document.getElementById('hb-guitar-btn');
            if (btn2) { btn2.innerHTML = '<i class="fa-solid fa-guitar"></i> Tocar Acordes'; btn2.className = 'btn btn-ghost'; btn2.style.cssText = 'border-color:var(--chord-green,#34d399);color:var(--chord-green,#34d399);'; }
        },

        // Build B1/B2 playback sequence for chords [ciStart, ciEnd)
        _buildSeq(ciStart, ciEnd) {
            _ensureSlots();
            const slotDur = _slotDur();
            const seq = [];   // {type:'B', ci, col, degIdx, note, dur, ms}

            for (let ci = ciStart; ci < ciEnd; ci++) {
                const chord = _st.chords[ci];
                if (!chord) continue;
                const slot = _st.slots[ci] || { b1:'', b2:'' };

                // B1 / B2
                [slot.b1, slot.b2].forEach((str, col) => {
                    const degs = _parseDegs(str);
                    if (!degs.length) return;
                    const perDur = _subdivDur(slotDur, degs.length);
                    const perMs  = _durToMs(perDur, _st.bpm);
                    degs.forEach((deg, degIdx) => {
                        const note = (deg === '-') ? null : _degToNote7str(deg, chord);
                        seq.push({ type:'B', ci, col, degIdx, note, dur: perDur, ms: perMs });
                    });
                });
            }
            return seq;
        },

        _scheduleSeq(seq) {
            let cumMs = 0;
            let prevCi = -1;
            seq.forEach(item => {
                // Card glow on first note of each new chord
                if (item.ci !== prevCi) {
                    prevCi = item.ci;
                    const t0 = setTimeout(() => {
                        _st.playingCi = item.ci;
                        C._setCardActive(item.ci);
                    }, cumMs);
                    _st.playTimers.push(t0);
                }
                // Note highlight
                const t = setTimeout(() => {
                    if (item.note) C._activateBassHighlight(item.ci, item.col, item.degIdx);
                    else           C._clearBassHighlight();
                }, cumMs);
                cumMs += item.ms;
                _st.playTimers.push(t);
            });
            return cumMs;
        },

        _togglePlay() {
            if (_st.playing) { C._stopAll(); return; }

            const seq      = C._buildSeq(0, _st.chords.length);
            const audioSeq = seq.filter(s => s.note).map(s => ({ note: s.note, dur: s.dur }));
            if (!audioSeq.length) { window.HMSApp.showToast('Sem notas para tocar.', 'warning'); return; }

            _st.playing = true;
            const btn = document.getElementById('hb-play-btn');
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-stop"></i> Parar'; btn.className = 'btn btn-secondary'; }

            const totalMs = C._scheduleSeq(seq);
            _st.playTimers.push(setTimeout(() => C._stopAll(), totalMs + 100));
            window.HMSAudio.playMelody(audioSeq, _st.bpm, () => C._stopAll(), _st.timeSig);
        },

        _toggleGuitarPlay() {
            if (_st.playing) { C._stopAll(); return; }

            const chords = _st.chords.slice();
            if (!chords.length) { window.HMSApp.showToast('Sem acordes para tocar.', 'warning'); return; }

            const strumMode = _st.instrument === 'guitar' ? 'guitar-sample'
                            : _st.instrument === 'cavaco'  ? 'cavaco-sample'
                            : 'basic';

            _st.playing = true;
            const btn = document.getElementById('hb-guitar-btn');
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-stop"></i> Parar'; btn.className = 'btn btn-secondary'; btn.style.cssText = ''; }

            window.HMSAudio.playSequence(null, _st.bpm, () => C._stopAll(), strumMode, (seqIdx) => {
                _st.playingCi = seqIdx;
                C._setCardActive(seqIdx);
            }, chords);
        },

        _playChord(ci) {
            if (_st.playing) C._stopAll();
            const chord = _st.chords[ci];
            if (!chord) return;

            const seq      = C._buildSeq(ci, ci + 1);
            const audioSeq = seq.filter(s => s.note).map(s => ({ note: s.note, dur: s.dur }));
            if (!audioSeq.length) return;

            _st.playing = true;
            C._setCardActive(ci);
            const totalMs = C._scheduleSeq(seq);
            _st.playTimers.push(setTimeout(() => C._stopAll(), totalMs + 100));
            window.HMSAudio.playMelody(audioSeq, _st.bpm, () => C._stopAll(), _st.timeSig);
        },

        // ── Studies tab ──────────────────────────────────────────────────────

        _renderStudies() {
            document.getElementById('hb-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-folder-open"></i></div>
                        <div>
                            <h2>Conduções de Baixo Salvas</h2>
                            <p>Linhas de baixo por acorde</p>
                        </div>
                    </div>
                </div>
                <div id="hb-studies-list">
                    <div style="text-align:center;padding:2rem;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-spin"></i> Carregando…
                    </div>
                </div>
            `;
            document.getElementById('hb-studies-list').addEventListener('click', e => {
                const loadBtn = e.target.closest('.hb-load-study');
                const delBtn  = e.target.closest('.hb-del-study');
                if (loadBtn) C._loadStudy(loadBtn.dataset.id);
                if (delBtn)  C._deleteStudy(delBtn.dataset.id);
            });
            C._loadStudies();
        },

        _loadStudies: async function () {
            try {
                const user = await window.HMSAuth.currentUser();
                _st.currentUserId = user?.id || null;
                _st.studies = await window.HMSAPI.BassStudies.getAll();
            } catch (_e) {
                window.HMSApp.showToast('Erro ao carregar estudos.', 'error');
                _st.studies = [];
            }
            C._renderStudiesList();
        },

        _renderStudiesList() {
            const listEl = document.getElementById('hb-studies-list');
            if (!listEl) return;
            if (!_st.studies.length) {
                listEl.innerHTML = `
                    <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                        <i class="fa-solid fa-music" style="font-size:2rem;opacity:.3;display:block;margin-bottom:.75rem;"></i>
                        Nenhum estudo salvo ainda.
                    </div>`;
                return;
            }
            listEl.innerHTML = _st.studies.map(s => {
                const keyLabel = s.root + (s.is_minor ? 'm' : '') + ' ' + (s.is_minor ? 'Menor' : 'Maior');
                const isOwner  = s.user_id === _st.currentUserId;
                return `
                <div class="panel" style="margin-bottom:.75rem;">
                    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;">
                        <div style="flex:1;min-width:0;">
                            <span style="font-size:.9rem;font-weight:600;color:var(--text-primary);">${esc(s.title)}</span>
                            <span style="font-size:.75rem;color:var(--text-muted);margin-left:10px;font-family:var(--font-mono);">${esc(s.harmony)}</span>
                        </div>
                        <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${esc(keyLabel)} · ${s.bpm || 80} BPM</span>
                        <button class="btn btn-primary hb-load-study" data-id="${esc(s.id)}"
                            style="padding:4px 14px;font-size:.82rem;flex-shrink:0;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Carregar
                        </button>
                        ${isOwner ? `
                        <button class="btn btn-ghost hb-del-study" data-id="${esc(s.id)}"
                            style="padding:4px 10px;font-size:.82rem;flex-shrink:0;color:var(--chord-red,#f87171);">
                            <i class="fa-solid fa-trash"></i>
                        </button>` : ''}
                    </div>
                </div>`;
            }).join('');
        },

        _loadStudy(id) {
            const study = _st.studies.find(s => s.id === id);
            if (!study) return;
            _st.root        = study.root || 'C';
            _st.isMinor     = !!study.is_minor;
            _st.harmonyStr  = study.harmony || '';
            _st.bpm         = study.bpm || 80;
            _st.timeSig     = study.time_sig || '2/4';
            _st.savingTitle = study.title || '';
            // slots: "n1 n2|b1|b2"  (legacy "n1 n2" also supported)
            const raw = study.slots || [];
            _st.slots = raw.map(item => {
                const str    = String(item || '');
                const parts  = str.split('|');
                const t      = (parts[0] || '1 5').trim().split(/\s+/);
                return { n1: t[0] || '1', n2: t[1] || '5', b1: parts[1] || '', b2: parts[2] || '' };
            });
            _parseHarmony();
            _ensureSlots();
            _st.tab = 'editor';
            C._render();
            window.HMSApp.showToast(`"${study.title}" carregado.`, 'success');
        },

        _showDebug: function (info) {
            let panel = document.getElementById('hb-debug-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'hb-debug-panel';
                panel.style.cssText = 'margin-top:16px;background:#0a1628;border:1px solid #f59e0b;border-radius:10px;padding:14px 16px;font-family:monospace;font-size:.75rem;color:#fbbf24;white-space:pre-wrap;word-break:break-all;max-height:320px;overflow-y:auto;';
                const container = document.getElementById('hb-save-section') || document.querySelector('.hb-editor');
                if (container) container.appendChild(panel);
                else document.getElementById('hb-root')?.appendChild(panel);
            }
            const ts = new Date().toLocaleTimeString('pt-BR');
            panel.textContent = `[${ts}] DEBUG SAVE\n${JSON.stringify(info, null, 2)}`;
        },

        _saveStudy: async function () {
            const title = (_st.savingTitle || '').trim();
            if (!title)                 { window.HMSApp.showToast('Informe um título.', 'warning'); return; }
            if (!_st.harmonyStr.trim()) { window.HMSApp.showToast('Harmonia vazia.', 'warning');   return; }
            _ensureSlots();
            const payload = {
                title,
                root:     _st.root,
                is_minor: _st.isMinor,
                harmony:  _st.harmonyStr,
                bpm:      _st.bpm,
                note_dur: 'bass',
                slots:    _st.slots.map(s => `${s.n1 || '1'} ${s.n2 || '5'}|${s.b1 || ''}|${s.b2 || ''}`),
            };
            const debugInfo = { title, payload, operation: null, existingId: null, userId: null, response: null, error: null };
            try {
                // Ensure studies are loaded
                _st.studies = await window.HMSAPI.BassStudies.getAll();

                const user = await window.HMSAuth.currentUser();
                debugInfo.userId = user?.id || 'NULL';

                const existing = _st.studies.find(s => s.title.trim().toLowerCase() === title.toLowerCase());

                if (existing) {
                    debugInfo.operation  = 'UPDATE';
                    debugInfo.existingId = existing.id;
                    debugInfo.existingUserId = existing.user_id;
                    const result = await window.HMSAPI.BassStudies.updateDebug(existing.id, payload, user.id);
                    debugInfo.response = result;
                    if (result.rowCount === 0) {
                        window.HMSApp.showToast('⚠️ Update executado mas 0 linhas afetadas!', 'warning');
                    } else {
                        window.HMSApp.showToast('Estudo atualizado!', 'success');
                    }
                } else {
                    debugInfo.operation = 'INSERT';
                    await window.HMSAPI.BassStudies.create(payload);
                    debugInfo.response = { ok: true };
                    window.HMSApp.showToast('Estudo salvo!', 'success');
                }
                _st.savingTitle = '';
                const el = document.getElementById('hb-save-title');
                if (el) el.value = '';
                _st.studies = await window.HMSAPI.BassStudies.getAll();
            } catch (err) {
                debugInfo.error = { message: err.message, code: err.code, details: err.details, hint: err.hint };
                console.error('[HarmonicBass] Save error:', err);
                window.HMSApp.showToast('Erro ao salvar. Ver painel debug.', 'error');
            }
            C._showDebug(debugInfo);
        },

        _deleteStudy: async function (id) {
            const study = _st.studies.find(s => s.id === id);
            const name  = study?.title ? `"${study.title}"` : 'este estudo';
            if (!confirm(`Excluir ${name}?\nEsta ação não pode ser desfeita.`)) return;
            try {
                await window.HMSAPI.BassStudies.delete(id);
                _st.studies = _st.studies.filter(s => s.id !== id);
                C._renderStudiesList();
                window.HMSApp.showToast('Estudo removido.', 'success');
            } catch (err) {
                window.HMSApp.showToast('Erro ao remover.', 'error');
            }
        },

        // ══════════════════════════════════════════════════════════
        // ── TREINO ALEATÓRIO ──────────────────────────────────────
        // ══════════════════════════════════════════════════════════

        _renderTrain: async function () {
            const tabEl = document.getElementById('hb-tab-content');
            tabEl.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-shuffle"></i></div>
                        <div>
                            <h2>Treino Aleatório</h2>
                            <p>Estude harmonias de forma aleatória com filtros do Repertório</p>
                        </div>
                    </div>
                </div>
                <div id="hb-train-wrap">
                    <div style="text-align:center;padding:2rem;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-spin"></i> Carregando playlists e músicas…
                    </div>
                </div>
            `;

            // Load setlists and songs in parallel
            try {
                const [setlists, songs] = await Promise.all([
                    window.HMSAPI.Setlists.getAll(),
                    window.HMSAPI.Songs.getAll(),
                ]);
                _st.trainSetlists = setlists || [];
                _st.trainAllSongs = (songs || []).filter(s => s.harmony_str && s.harmony_str.trim());
            } catch (err) {
                _st.trainSetlists = [];
                _st.trainAllSongs = [];
                window.HMSApp.showToast('Erro ao carregar dados.', 'error');
            }

            C._renderTrainFilters();
        },

        // ── Render the filter panel ───────────────────────────────
        _renderTrainFilters() {
            const wrap = document.getElementById('hb-train-wrap');
            if (!wrap) return;

            const f = _st.trainFilters;

            // ── Flag color map (same as Repertório) ──────────────
            const FLAG_COLORS = ['#6b7280','#22c55e','#eab308','#f97316','#3b82f6','#a855f7','#6b7280'];
            const FLAG_ICONS  = ['fa-circle-dot','fa-flag','fa-flag','fa-flag','fa-flag','fa-flag','fa-flag'];
            const FLAG_LABELS = ['Todas','Verde','Amarelo','Laranja','Azul','Roxo','Cinza'];

            // ── Setlist chips ─────────────────────────────────────
            const setlistChips = _st.trainSetlists.length
                ? _st.trainSetlists.map(sl => {
                    const on = f.setlistIds.has(sl.id);
                    return `<button class="hb-train-setlist" data-id="${esc(sl.id)}" style="
                        padding:5px 14px;border-radius:99px;font-size:.8rem;cursor:pointer;
                        font-family:var(--font-ui);font-weight:${on ? '700' : '400'};
                        background:${on ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--glass-bg)'};
                        border:1.5px solid ${on ? 'var(--brand,#7c3aed)' : 'var(--glass-border)'};
                        color:${on ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};
                        transition:all .15s;">${esc(sl.name)}</button>`;
                }).join('')
                : `<span style="font-size:.78rem;color:var(--text-muted);">Nenhuma playlist encontrada</span>`;

            // ── Key chips ─────────────────────────────────────────
            const keyChips = window.HarmonyEngine.allKeys().map(k => {
                const on = f.keys.has(k.value);
                return `<button class="hb-train-key" data-key="${esc(k.value)}" style="
                    padding:3px 10px;border-radius:6px;font-size:.72rem;cursor:pointer;
                    font-family:var(--font-mono);font-weight:600;
                    background:${on ? 'var(--brand-dim)' : 'var(--glass-bg)'};
                    border:1.5px solid ${on ? 'var(--brand,#7c3aed)' : 'var(--glass-border)'};
                    color:${on ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};
                    transition:all .15s;">${esc(k.label)}</button>`;
            }).join('');

            // ── Flag chips ────────────────────────────────────────
            const flagChips = [0,1,2,3,4,5,6].map(n => {
                const on = f.flags.has(n);
                return `<button class="hb-train-flag" data-flag="${n}" title="${FLAG_LABELS[n]}" style="
                    width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;
                    align-items:center;justify-content:center;font-size:.75rem;
                    background:${on ? FLAG_COLORS[n] + '33' : 'var(--glass-bg)'};
                    border:2px solid ${on ? FLAG_COLORS[n] : 'var(--glass-border)'};
                    color:${on ? FLAG_COLORS[n] : 'var(--text-muted)'};
                    transition:all .15s;">
                    <i class="fa-solid ${FLAG_ICONS[n]}"></i>
                </button>`;
            }).join('');

            // ── Tristate button helper ─────────────────────────────
            const triBtn = (cls, cur, val, label) => {
                const on = cur === val;
                return `<button class="${cls}" data-val="${val}" style="
                    padding:3px 10px;border-radius:6px;font-size:.75rem;cursor:pointer;
                    font-weight:${on ? '700' : '400'};
                    background:${on ? 'var(--brand-dim)' : 'var(--glass-bg)'};
                    border:1.5px solid ${on ? 'var(--brand,#7c3aed)' : 'var(--glass-border)'};
                    color:${on ? 'var(--brand,#7c3aed)' : 'var(--text-secondary)'};
                    transition:all .15s;">${label}</button>`;
            };

            // ── Count preview ─────────────────────────────────────
            const preview = C._countFiltered();

            wrap.innerHTML = `
            <div class="panel" style="margin-bottom:.75rem;padding:14px 16px;">

                <!-- Playlists -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">PLAYLISTS <span style="opacity:.5;font-weight:400;">(vazio = todas)</span></div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${setlistChips}
                    </div>
                </div>

                <!-- Tons -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">TOM <span style="opacity:.5;font-weight:400;">(vazio = todos)</span></div>
                    <div style="display:flex;flex-wrap:wrap;gap:5px;">
                        ${keyChips}
                    </div>
                </div>

                <!-- Flags -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">FLAG <span style="opacity:.5;font-weight:400;">(vazio = todas)</span></div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        ${flagChips}
                    </div>
                </div>

                <!-- Harm / Letra / Link -->
                <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:.72rem;font-weight:700;color:var(--text-muted);">HARM:</span>
                        ${triBtn('hb-train-harm','●',null,'●')}
                        ${triBtn('hb-train-harm',f.harm,true,'S')}
                        ${triBtn('hb-train-harm',f.harm,false,'N')}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:.72rem;font-weight:700;color:var(--text-muted);">LETRA:</span>
                        ${triBtn('hb-train-letra','●',null,'●')}
                        ${triBtn('hb-train-letra',f.letra,true,'S')}
                        ${triBtn('hb-train-letra',f.letra,false,'N')}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:.72rem;font-weight:700;color:var(--text-muted);">LINK:</span>
                        ${triBtn('hb-train-link','●',null,'●')}
                        ${triBtn('hb-train-link',f.link,true,'S')}
                        ${triBtn('hb-train-link',f.link,false,'N')}
                    </div>
                </div>

                <!-- Start button -->
                <div style="display:flex;align-items:center;gap:12px;padding-top:12px;border-top:1px solid var(--glass-border);">
                    <span id="hb-train-count" style="font-size:.82rem;color:var(--text-muted);">
                        <i class="fa-solid fa-music"></i> <strong style="color:var(--text-primary);">${preview}</strong> música${preview !== 1 ? 's' : ''} selecionada${preview !== 1 ? 's' : ''}
                    </span>
                    <button id="hb-train-start" class="btn btn-primary" style="margin-left:auto;" ${preview === 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-play"></i> Iniciar Treino
                    </button>
                </div>
            </div>

            <!-- Hint -->
            <div style="font-size:.7rem;color:var(--text-muted);padding:5px 10px;
                background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                Apenas músicas com harmonia preenchida são incluídas no treino.
                Use as setas ← → ou clique nos botões para navegar · Tecla <code>Esc</code> fecha o modal.
            </div>
            `;

            C._bindTrainEvents();
        },

        // ── Bind filter events ────────────────────────────────────
        _bindTrainEvents() {
            const wrap = document.getElementById('hb-train-wrap');
            if (!wrap) return;

            // Setlist toggle
            wrap.querySelectorAll('.hb-train-setlist').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    if (_st.trainFilters.setlistIds.has(id)) _st.trainFilters.setlistIds.delete(id);
                    else _st.trainFilters.setlistIds.add(id);
                    C._renderTrainFilters();
                });
            });

            // Key toggle
            wrap.querySelectorAll('.hb-train-key').forEach(btn => {
                btn.addEventListener('click', () => {
                    const k = btn.dataset.key;
                    if (_st.trainFilters.keys.has(k)) _st.trainFilters.keys.delete(k);
                    else _st.trainFilters.keys.add(k);
                    C._renderTrainFilters();
                });
            });

            // Flag toggle
            wrap.querySelectorAll('.hb-train-flag').forEach(btn => {
                btn.addEventListener('click', () => {
                    const n = +btn.dataset.flag;
                    if (_st.trainFilters.flags.has(n)) _st.trainFilters.flags.delete(n);
                    else _st.trainFilters.flags.add(n);
                    C._renderTrainFilters();
                });
            });

            // Harm tristate
            wrap.querySelectorAll('.hb-train-harm').forEach(btn => {
                btn.addEventListener('click', () => {
                    const v = btn.dataset.val;
                    _st.trainFilters.harm = v === 'null' || v === '●' ? null : v === 'true';
                    C._renderTrainFilters();
                });
            });

            // Letra tristate
            wrap.querySelectorAll('.hb-train-letra').forEach(btn => {
                btn.addEventListener('click', () => {
                    const v = btn.dataset.val;
                    _st.trainFilters.letra = v === 'null' || v === '●' ? null : v === 'true';
                    C._renderTrainFilters();
                });
            });

            // Link tristate
            wrap.querySelectorAll('.hb-train-link').forEach(btn => {
                btn.addEventListener('click', () => {
                    const v = btn.dataset.val;
                    _st.trainFilters.link = v === 'null' || v === '●' ? null : v === 'true';
                    C._renderTrainFilters();
                });
            });

            // Start button
            const startBtn = document.getElementById('hb-train-start');
            if (startBtn) startBtn.addEventListener('click', () => C._startTrain());

            // Keyboard navigation
            C._bindTrainKeyboard();
        },

        // ── Count filtered songs (preview) ────────────────────────
        _countFiltered() {
            return C._applyTrainFilters(_st.trainAllSongs).length;
        },

        // ── Apply all filters to a song array ─────────────────────
        _applyTrainFilters(songs) {
            const f = _st.trainFilters;
            let result = songs.filter(s => s.harmony_str && s.harmony_str.trim());

            // Filter by setlist — need setlist membership info
            if (f.setlistIds.size > 0) {
                result = result.filter(s => s._setlistIds && [...f.setlistIds].some(id => s._setlistIds.includes(id)));
            }

            // Filter by key
            if (f.keys.size > 0) {
                result = result.filter(s => f.keys.has(s.original_key));
            }

            // Filter by flag
            if (f.flags.size > 0) {
                result = result.filter(s => f.flags.has(s.status_flag ?? 0));
            }

            // Harm — does the song have a harmony string? (same logic as Repertório filterHarm)
            if (f.harm !== null) {
                result = result.filter(s => !!(s.harmony_str && s.harmony_str.trim()) === f.harm);
            }

            // Letra — has_lyrics flag
            if (f.letra !== null) {
                result = result.filter(s => !!s.has_lyrics === f.letra);
            }

            // Link — has audio_url
            if (f.link !== null) {
                result = result.filter(s => !!s.audio_url === f.link);
            }

            return result;
        },


        // ── Start the training session ────────────────────────────
        _startTrain: async function () {
            const startBtn = document.getElementById('hb-train-start');
            if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Carregando…'; }

            try {
                // If any setlist filter active, we need setlist membership
                let songs = _st.trainAllSongs;
                if (_st.trainFilters.setlistIds.size > 0) {
                    // Load songs for each selected setlist and tag them
                    const setlistSongSets = await Promise.all(
                        [..._st.trainFilters.setlistIds].map(id => window.HMSAPI.Songs.getAll({ setlistId: id }))
                    );
                    // Build a map of songId → setlistIds[]
                    const memberMap = {};
                    setlistSongSets.forEach((slSongs, idx) => {
                        const slId = [..._st.trainFilters.setlistIds][idx];
                        (slSongs || []).forEach(s => {
                            if (!memberMap[s.id]) memberMap[s.id] = [];
                            memberMap[s.id].push(slId);
                        });
                    });
                    // Annotate songs
                    songs = songs.map(s => ({ ...s, _setlistIds: memberMap[s.id] || [] }));
                }

                let filtered = C._applyTrainFilters(songs);

                if (filtered.length === 0) {
                    window.HMSApp.showToast('Nenhuma música encontrada com esses filtros.', 'warning');
                    if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar Treino'; }
                    return;
                }

                // Fisher-Yates shuffle
                const arr = filtered.slice();
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }

                _st.trainSongs  = arr;
                _st.trainIdx    = 0;
                _st.trainActive = true;

                C._openTrainModal();
            } catch (err) {
                console.error('[HarmonicBass] Train start error:', err);
                window.HMSApp.showToast('Erro ao iniciar treino.', 'error');
            } finally {
                if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar Treino'; }
            }
        },

        // ── Navigate in the shuffled queue ───────────────────────
        _trainNavigate(delta) {
            if (!_st.trainSongs.length) return;
            _st.trainIdx = ((_st.trainIdx + delta) % _st.trainSongs.length + _st.trainSongs.length) % _st.trainSongs.length;
            C._updateTrainModalContent();
        },

        // ── Build chord display for a song ───────────────────────
        _trainChordsHtml(song) {
            if (!song.harmony_str || !song.harmony_str.trim()) return '';
            try {
                // Detect root & minor from original_key (e.g. "Gm", "C", "F#m")
                const raw = song.original_key || 'C';
                const isMinor = raw.endsWith('m');
                const root = isMinor ? raw.slice(0, -1) : raw;

                const tokens = window.HarmonyEngine.translate(song.harmony_str, root, isMinor);
                const chords = tokens.filter(t => t.type === 'CHORD').map(t => t.value);

                if (!chords.length) return `<code style="font-size:.85rem;color:var(--text-muted);">${esc(song.harmony_str)}</code>`;

                return chords.map(ch => {
                    const col = _chordColor(ch);
                    return `<span style="
                        display:inline-block;padding:3px 10px;border-radius:6px;margin:3px;
                        background:var(--bg-raised);border:1px solid var(--glass-border);
                        font-family:var(--font-mono);font-size:1rem;font-weight:700;
                        color:${col};">${esc(ch)}</span>`;
                }).join('');
            } catch (_) {
                return `<code style="font-size:.85rem;color:var(--text-muted);">${esc(song.harmony_str)}</code>`;
            }
        },

        // ── Render modal content for current song ─────────────────
        _updateTrainModalContent() {
            const song  = _st.trainSongs[_st.trainIdx];
            const total = _st.trainSongs.length;
            const idx   = _st.trainIdx;

            const counterEl = document.getElementById('hb-tm-counter');
            if (counterEl) counterEl.textContent = `${idx + 1} / ${total}`;

            const bodyEl = document.getElementById('hb-tm-body');
            if (!bodyEl || !song) return;

            const raw      = song.original_key || '';
            const isMinor  = raw.endsWith('m');
            const keyLabel = raw
                ? `${raw} ${isMinor ? 'Menor' : 'Maior'}`
                : '—';

            bodyEl.innerHTML = `
                <div style="text-align:center;padding:0 4px;">
                    <!-- Song title -->
                    <div style="font-size:1.45rem;font-weight:800;color:var(--text-primary);
                        margin-bottom:4px;line-height:1.2;">${esc(song.title || '—')}</div>

                    <!-- Artist + key -->
                    <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:20px;">
                        ${song.artist ? `<span>${esc(song.artist)}</span> · ` : ''}
                        <span style="font-family:var(--font-mono);font-weight:700;
                            color:var(--brand,#7c3aed);">${esc(keyLabel)}</span>
                    </div>

                    <!-- Harmony raw string -->
                    <div style="font-size:.72rem;font-weight:700;letter-spacing:.07em;
                        color:var(--text-muted);margin-bottom:10px;">HARMONIA (${esc(song.harmony_str || '')})</div>

                    <!-- Translated chords -->
                    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:2px;
                        margin-bottom:24px;min-height:40px;">
                        ${C._trainChordsHtml(song)}
                    </div>

                    <!-- Metadata badges -->
                    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;
                        font-size:.7rem;color:var(--text-muted);">
                        ${song.genre ? `<span style="padding:2px 8px;background:var(--bg-raised);border-radius:4px;border:1px solid var(--glass-border);">${esc(song.genre)}</span>` : ''}
                        ${song.has_lyrics ? `<span style="padding:2px 8px;background:var(--bg-raised);border-radius:4px;border:1px solid var(--glass-border);color:#34d399;"><i class="fa-solid fa-align-left"></i> Letra</span>` : ''}
                        ${song.audio_url  ? `<span style="padding:2px 8px;background:var(--bg-raised);border-radius:4px;border:1px solid var(--glass-border);color:#60a5fa;"><i class="fa-solid fa-link"></i> Link</span>` : ''}
                    </div>
                </div>
            `;
        },

        // ── Open the training modal ───────────────────────────────
        _openTrainModal() {
            const song  = _st.trainSongs[_st.trainIdx];
            const total = _st.trainSongs.length;

            window.HMSApp.openModal(`
                <div id="hb-train-modal" style="
                    min-width:min(90vw,520px);max-width:600px;
                    display:flex;flex-direction:column;max-height:90vh;overflow:hidden;">

                    <!-- Header -->
                    <div class="modal-header" style="flex-shrink:0;">
                        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                            <i class="fa-solid fa-shuffle" style="color:var(--brand);"></i>
                            <span style="font-weight:700;font-size:.95rem;">Treino Aleatório</span>
                            <span id="hb-tm-counter" style="
                                margin-left:auto;font-size:.78rem;font-family:var(--font-mono);
                                background:var(--bg-raised);padding:2px 10px;border-radius:99px;
                                border:1px solid var(--glass-border);color:var(--text-muted);">
                                1 / ${total}
                            </span>
                        </div>
                        <button class="modal-close" id="hb-tm-close" style="flex-shrink:0;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <!-- Progress bar -->
                    <div style="height:3px;background:var(--bg-raised);flex-shrink:0;overflow:hidden;">
                        <div id="hb-tm-progress" style="
                            height:100%;
                            width:${((1 / total) * 100).toFixed(1)}%;
                            background:var(--brand,#7c3aed);
                            transition:width .35s ease;"></div>
                    </div>

                    <!-- Body (song display) -->
                    <div id="hb-tm-body" style="
                        flex:1;overflow-y:auto;padding:28px 24px 16px;"></div>

                    <!-- Navigation footer -->
                    <div style="
                        display:flex;align-items:center;justify-content:space-between;
                        padding:14px 20px;border-top:1px solid var(--glass-border);
                        flex-shrink:0;gap:10px;">
                        <button id="hb-tm-prev" class="btn btn-ghost" style="flex:1;max-width:160px;">
                            <i class="fa-solid fa-arrow-left"></i> Anterior
                        </button>
                        <button id="hb-tm-shuffle" class="btn btn-ghost" title="Embaralhar novamente" style="padding:7px 12px;">
                            <i class="fa-solid fa-shuffle"></i>
                        </button>
                        <button id="hb-tm-next" class="btn btn-primary" style="flex:1;max-width:160px;">
                            Próximo <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            `);

            // Populate body
            C._updateTrainModalContent();

            // Bind modal buttons
            document.getElementById('hb-tm-close')?.addEventListener('click', () => {
                _st.trainActive = false;
                window.HMSApp.closeModal();
            });

            document.getElementById('hb-tm-prev')?.addEventListener('click', () => {
                C._trainNavigate(-1);
                C._updateTrainProgress();
            });

            document.getElementById('hb-tm-next')?.addEventListener('click', () => {
                C._trainNavigate(+1);
                C._updateTrainProgress();
            });

            document.getElementById('hb-tm-shuffle')?.addEventListener('click', () => {
                // Re-shuffle from current position
                const arr = _st.trainSongs.slice();
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                _st.trainSongs = arr;
                _st.trainIdx   = 0;
                C._updateTrainModalContent();
                C._updateTrainProgress();
                window.HMSApp.showToast('Embaralhado novamente!', 'info');
            });
        },

        // ── Update progress bar ───────────────────────────────────
        _updateTrainProgress() {
            const total = _st.trainSongs.length;
            const pct   = total > 0 ? ((_st.trainIdx + 1) / total * 100).toFixed(1) : 0;
            const bar   = document.getElementById('hb-tm-progress');
            if (bar) bar.style.width = pct + '%';
        },

        // ── Global keyboard handler for train modal ───────────────
        _trainKeyHandler: null,
        _bindTrainKeyboard() {
            // Remove any existing handler
            if (C._trainKeyHandler) {
                document.removeEventListener('keydown', C._trainKeyHandler);
                C._trainKeyHandler = null;
            }
            C._trainKeyHandler = (e) => {
                if (!_st.trainActive) return;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    C._trainNavigate(+1);
                    C._updateTrainProgress();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    C._trainNavigate(-1);
                    C._updateTrainProgress();
                } else if (e.key === 'Escape') {
                    _st.trainActive = false;
                    window.HMSApp.closeModal();
                }
            };
            document.addEventListener('keydown', C._trainKeyHandler);
        },
    };


    window.HarmonicBassComponent = C;
    console.info('[HMS] HarmonicBassComponent loaded.');
})();
