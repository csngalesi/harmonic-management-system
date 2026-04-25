/**
 * HMS — Condução de Baixo
 * Dois grupos de graus por acorde (B1, B2) · até 4 graus/silêncios por grupo.
 * Playback divide o tempo pelo número de notas: 2=colcheias, 3=tercinas, 4=semicolcheias.
 * Notas no registro grave (violão de 7 cordas).
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
        chords:        [],
        slots:         [],   // [{b1:'1 5', b2:''}, ...] — one per chord
        playingCi:     null,
        playingCol:    null,
        playingDeg:    null,
        playing:       false,
        playTimers:    [],
        tab:           'editor',
        studies:       [],
        currentUserId: null,
        savingTitle:   '',
    };

    function _ensureSlots() {
        while (_st.slots.length < _st.chords.length) _st.slots.push({ b1: '1 5', b2: '' });
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

    // ── Note row HTML for one column ─────────────────────────────────────────
    function _noteRowHtml(degs, chord, ci, colIdx) {
        if (!degs.length) return `<div style="min-height:20px;"></div>`;
        const cells = degs.map((deg, di) => {
            const isSil  = deg === '-';
            const letter = isSil ? '—' : (_degToLetter(deg, chord) || '?');
            const isPlay = _st.playingCi === ci && _st.playingCol === colIdx && _st.playingDeg === di;
            return `<span id="hb-note-${ci}-${colIdx}-${di}"
                style="font-size:.68rem;font-weight:700;font-family:var(--font-mono);
                color:${isPlay ? '#fff' : isSil ? 'var(--text-muted)' : 'var(--chord-blue,#60a5fa)'};
                background:${isPlay ? 'var(--brand,#7c3aed)' : 'transparent'};
                border-radius:3px;padding:1px 3px;min-width:16px;text-align:center;
                transition:background .15s,color .15s;">${esc(letter)}</span>`;
        }).join('');
        return `<div style="display:flex;gap:2px;justify-content:center;flex-wrap:nowrap;">${cells}</div>`;
    }

    // ── Chord Card HTML ───────────────────────────────────────────────────────
    function _cardHtml(chord, ci) {
        const slot  = _st.slots[ci] || { b1: '1 5', b2: '' };
        const degs1 = _parseDegs(slot.b1);
        const degs2 = _parseDegs(slot.b2);
        const color = _chordColor(chord);

        const inputStyle =
            `width:100%;box-sizing:border-box;text-align:center;background:var(--bg-raised);` +
            `border:1px solid var(--glass-border);border-radius:3px;outline:none;` +
            `font-family:var(--font-mono);font-size:.65rem;font-weight:600;` +
            `color:var(--text-primary);padding:2px 3px;margin-bottom:4px;`;

        return `
        <div class="hb-card" data-ci="${ci}"
            style="flex-shrink:0;min-width:110px;max-width:160px;border-radius:8px;
            border:1px solid var(--glass-border,rgba(255,255,255,.08));
            background:var(--bg-surface);overflow:hidden;">
            <div style="padding:4px 6px 3px;display:flex;align-items:center;gap:4px;
                border-bottom:1px solid var(--line-color);background:var(--bg-raised);">
                <span style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:${color};">${esc(chord)}</span>
                <span style="flex:1;"></span>
                <button class="hb-play-chord btn btn-ghost" data-ci="${ci}"
                    style="padding:0px 5px;font-size:.6rem;">
                    <i class="fa-solid fa-play"></i>
                </button>
            </div>
            <div style="display:flex;align-items:stretch;gap:0;">
                <!-- B1 -->
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                    padding:5px 4px 6px;border-right:1px solid var(--line-color);">
                    <input class="hb-deg-input" data-ci="${ci}" data-col="0"
                        value="${esc(slot.b1)}"
                        placeholder="1 5"
                        style="${inputStyle}" />
                    ${_noteRowHtml(degs1, chord, ci, 0)}
                    <div style="font-size:.48rem;color:var(--text-muted);margin-top:3px;">B1</div>
                </div>
                <!-- B2 -->
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                    padding:5px 4px 6px;">
                    <input class="hb-deg-input" data-ci="${ci}" data-col="1"
                        value="${esc(slot.b2)}"
                        placeholder="—"
                        style="${inputStyle}" />
                    ${_noteRowHtml(degs2, chord, ci, 1)}
                    <div style="font-size:.48rem;color:var(--text-muted);margin-top:3px;">B2</div>
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
                        <p>Até 4 graus por tempo · B1 e B2 por acorde</p>
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
                    <button class="btn ${_st.playing ? 'btn-secondary' : 'btn-primary'}" id="hb-play-btn">
                        <i class="fa-solid fa-${_st.playing ? 'stop' : 'play'}"></i>
                        ${_st.playing ? 'Parar' : 'Tocar Linha'}
                    </button>
                </div>
            </div>

            <!-- Hint -->
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.75rem;padding:5px 10px;
                background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                B1/B2: graus separados por espaço · ex: <code>1 5</code> <code>1 b3 5 1</code> ·
                Use <code>-</code> para silêncio · 2 notas=colcheias · 3=tercinas · 4=semicolcheias ·
                Registro grave (7 cordas) · Tab=próximo acorde
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

        render() {
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
                btn.addEventListener('click', e => { _st.tab = e.currentTarget.dataset.tab; C.render(); });
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

            const grid = document.getElementById('hb-chord-grid');

            grid?.addEventListener('input', e => {
                const inp = e.target.closest('.hb-deg-input');
                if (!inp) return;
                const ci  = +inp.dataset.ci;
                const col = +inp.dataset.col;
                _ensureSlots();
                if (col === 0) _st.slots[ci].b1 = inp.value;
                else           _st.slots[ci].b2 = inp.value;
                C._refreshNoteRow(ci, col);
            });

            grid?.addEventListener('keydown', e => {
                const inp = e.target.closest('.hb-deg-input');
                if (!inp) return;
                const ci  = +inp.dataset.ci;
                const col = +inp.dataset.col;
                if (e.key === 'Tab') {
                    e.preventDefault();
                    if (col === 0) {
                        document.querySelector(`.hb-deg-input[data-ci="${ci}"][data-col="1"]`)?.focus();
                    } else {
                        const nextCi = e.shiftKey ? ci - 1 : ci + 1;
                        if (nextCi >= 0 && nextCi < _st.chords.length) {
                            document.querySelector(`.hb-deg-input[data-ci="${nextCi}"][data-col="0"]`)?.focus();
                        }
                    }
                }
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

        _refreshNoteRow(ci, col) {
            const chord = _st.chords[ci];
            if (!chord) return;
            const slot = _st.slots[ci];
            if (!slot) return;
            const degs = _parseDegs(col === 0 ? slot.b1 : slot.b2);
            const inp  = document.querySelector(`.hb-deg-input[data-ci="${ci}"][data-col="${col}"]`);
            if (!inp) return;
            const row = inp.nextElementSibling;
            if (row) row.outerHTML = _noteRowHtml(degs, chord, ci, col);
        },

        // ── Highlight ─────────────────────────────────────────────────────────

        _clearHighlight() {
            if (_st.playingCi !== null && _st.playingCol !== null && _st.playingDeg !== null) {
                const el = document.getElementById(`hb-note-${_st.playingCi}-${_st.playingCol}-${_st.playingDeg}`);
                if (el) { el.style.background = 'transparent'; el.style.color = 'var(--chord-blue,#60a5fa)'; }
            }
            _st.playingCi = null; _st.playingCol = null; _st.playingDeg = null;
        },

        _activateHighlight(ci, col, deg) {
            C._clearHighlight();
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
            C._clearHighlight();
            _st.playing = false;
            const btn = document.getElementById('hb-play-btn');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-play"></i> Tocar Linha';
                btn.className = 'btn btn-primary';
            }
        },

        // Build flat sequence of note events for a range of chords [ciStart, ciEnd)
        _buildSeq(ciStart, ciEnd) {
            _ensureSlots();
            const slotDur = _slotDur();
            const seq = [];
            for (let ci = ciStart; ci < ciEnd; ci++) {
                const chord = _st.chords[ci];
                if (!chord) continue;
                const slot = _st.slots[ci] || { b1: '1 5', b2: '' };
                [slot.b1, slot.b2].forEach((str, col) => {
                    const degs = _parseDegs(str);
                    if (!degs.length) return;
                    const perDur = _subdivDur(slotDur, degs.length);
                    const perMs  = _durToMs(perDur, _st.bpm);
                    degs.forEach((deg, degIdx) => {
                        const note = (deg === '-') ? null : _degToNote7str(deg, chord);
                        seq.push({ ci, col, degIdx, note, dur: perDur, ms: perMs });
                    });
                });
            }
            return seq;
        },

        _scheduleHighlights(seq) {
            let cumMs = 0;
            seq.forEach(item => {
                const t = setTimeout(() => {
                    if (item.note) C._activateHighlight(item.ci, item.col, item.degIdx);
                    else           C._clearHighlight();
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

            const totalMs = C._scheduleHighlights(seq);
            _st.playTimers.push(setTimeout(() => C._stopAll(), totalMs + 100));
            window.HMSAudio.playMelody(audioSeq, _st.bpm, () => C._stopAll(), _st.timeSig);
        },

        _playChord(ci) {
            if (_st.playing) C._stopAll();
            const chord = _st.chords[ci];
            if (!chord) return;

            const seq      = C._buildSeq(ci, ci + 1);
            const audioSeq = seq.filter(s => s.note).map(s => ({ note: s.note, dur: s.dur }));
            if (!audioSeq.length) return;

            _st.playing = true;
            const totalMs = C._scheduleHighlights(seq);
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
            // slots stored as "b1_str|b2_str" per chord
            // Legacy format "deg1 deg2" (no pipe) is also handled: b1=whole string, b2=''
            const raw = study.slots || [];
            _st.slots = raw.map(item => {
                const str   = String(item || '');
                const pipeI = str.indexOf('|');
                if (pipeI >= 0) return { b1: str.slice(0, pipeI), b2: str.slice(pipeI + 1) };
                return { b1: str || '1 5', b2: '' };
            });
            _parseHarmony();
            _ensureSlots();
            _st.tab = 'editor';
            C.render();
            window.HMSApp.showToast(`"${study.title}" carregado.`, 'success');
        },

        _saveStudy: async function () {
            const title = (_st.savingTitle || '').trim();
            if (!title)                 { window.HMSApp.showToast('Informe um título.', 'warning'); return; }
            if (!_st.harmonyStr.trim()) { window.HMSApp.showToast('Harmonia vazia.', 'warning');   return; }
            _ensureSlots();
            try {
                await window.HMSAPI.BassStudies.create({
                    title,
                    root:     _st.root,
                    is_minor: _st.isMinor,
                    harmony:  _st.harmonyStr,
                    bpm:      _st.bpm,
                    note_dur: 'bass',
                    slots:    _st.slots.map(s => `${s.b1 || '1 5'}|${s.b2 || ''}`),
                });
                window.HMSApp.showToast('Estudo salvo!', 'success');
                _st.savingTitle = '';
                const el = document.getElementById('hb-save-title');
                if (el) el.value = '';
            } catch (err) {
                console.error('[HarmonicBass] Save error:', err);
                window.HMSApp.showToast('Erro ao salvar.', 'error');
            }
        },

        _deleteStudy: async function (id) {
            try {
                await window.HMSAPI.BassStudies.delete(id);
                _st.studies = _st.studies.filter(s => s.id !== id);
                C._renderStudiesList();
                window.HMSApp.showToast('Estudo removido.', 'success');
            } catch (err) {
                window.HMSApp.showToast('Erro ao remover.', 'error');
            }
        },
    };

    window.HarmonicBassComponent = C;
    console.info('[HMS] HarmonicBassComponent loaded.');
})();
