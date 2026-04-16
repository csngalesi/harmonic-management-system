/**
 * HMS — Condução de Baixo
 * Dois graus por acorde · exibição como letras · sem partitura.
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
        const rootIdx = _NOTE_NAMES.indexOf(root);
        const rootIdxFlat = _FLAT_NAMES.indexOf(root);
        const ri = rootIdx >= 0 ? rootIdx : (rootIdxFlat >= 0 ? rootIdxFlat : 0);
        const st = DEG_ST[deg] ?? 0;
        const idx = (ri + st) % 12;
        // Prefer flat names for flat-based keys
        const useFlatKey = ['F','Bb','Eb','Ab','Db','Gb'].includes(root) || deg.startsWith('b');
        return useFlatKey ? _FLAT_NAMES[idx] : _NOTE_NAMES[idx];
    }

    function _degToNote(rawDeg, chordName) {
        // Returns a Tone.js note string (with octave) for playback
        if (!rawDeg || !rawDeg.trim()) return null;
        try {
            const deg = _normalizeDeg(rawDeg.trim(), chordName);
            const { root } = _parseChordName(chordName);
            const result = window.MelodyEngine.translate([{ deg, oct: 0, dur: '4n' }], root);
            return result.length ? result[0].note : null;
        } catch (_) { return null; }
    }

    // ── Duration per slot based on time signature ─────────────────────────────
    function _slotDur() {
        const [num] = _st.timeSig.split('/').map(Number);
        if (num === 2) return '4n';
        if (num === 4) return '2n';
        if (num === 3) return '4n.';
        if (num === 6) return '4n.'; // 6/8: each half = 3 eighths
        return '4n';
    }

    function _durToMs(dur, bpm) {
        const b = 60000 / bpm;
        const map = { '1n':b*4,'2n':b*2,'4n':b,'4n.':b*1.5,'8n':b/2,'8n.':b*.75,'16n':b/4 };
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
        slots:         [],   // [{n1:'1', n2:'5'}, ...] — one per chord
        playingCi:     null,
        playingSlot:   null,
        playing:       false,
        playTimers:    [],
        tab:           'editor',
        studies:       [],
        currentUserId: null,
        savingTitle:   '',
    };

    function _ensureSlots() {
        while (_st.slots.length < _st.chords.length) _st.slots.push({ n1: '1', n2: '5' });
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

    // ── Chord Card HTML ───────────────────────────────────────────────────────
    function _cardHtml(chord, ci) {
        const slot  = _st.slots[ci] || { n1: '1', n2: '5' };
        const color = _chordColor(chord);
        const letter1 = _degToLetter(slot.n1, chord);
        const letter2 = _degToLetter(slot.n2, chord);
        const isPlaying1 = _st.playingCi === ci && _st.playingSlot === 0;
        const isPlaying2 = _st.playingCi === ci && _st.playingSlot === 1;

        const noteStyle = (active) =>
            `font-size:.8rem;font-weight:800;font-family:var(--font-mono);` +
            `color:${active ? '#fff' : 'var(--chord-blue,#60a5fa)'};` +
            `background:${active ? 'var(--brand,#7c3aed)' : 'transparent'};` +
            `border-radius:4px;padding:1px 4px;min-width:28px;text-align:center;` +
            `transition:background .15s,color .15s;`;

        return `
        <div class="hb-card" data-ci="${ci}"
            style="flex-shrink:0;min-width:80px;max-width:120px;border-radius:8px;
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
                <!-- Slot 1 -->
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                    padding:5px 4px 6px;border-right:1px solid var(--line-color);">
                    <input class="hb-deg-input" data-ci="${ci}" data-slot="0"
                        value="${esc(slot.n1)}"
                        placeholder="1"
                        style="width:100%;box-sizing:border-box;text-align:center;background:var(--bg-raised);
                        border:1px solid var(--glass-border);border-radius:3px;outline:none;
                        font-family:var(--font-mono);font-size:.7rem;font-weight:600;
                        color:var(--text-primary);padding:2px 2px;margin-bottom:4px;" />
                    <div id="hb-letter-${ci}-0" style="${noteStyle(isPlaying1)}">${esc(letter1)||'—'}</div>
                    <div style="font-size:.5rem;color:var(--text-muted);margin-top:2px;">T1</div>
                </div>
                <!-- Slot 2 -->
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                    padding:5px 4px 6px;">
                    <input class="hb-deg-input" data-ci="${ci}" data-slot="1"
                        value="${esc(slot.n2)}"
                        placeholder="5"
                        style="width:100%;box-sizing:border-box;text-align:center;background:var(--bg-raised);
                        border:1px solid var(--glass-border);border-radius:3px;outline:none;
                        font-family:var(--font-mono);font-size:.7rem;font-weight:600;
                        color:var(--text-primary);padding:2px 2px;margin-bottom:4px;" />
                    <div id="hb-letter-${ci}-1" style="${noteStyle(isPlaying2)}">${esc(letter2)||'—'}</div>
                    <div style="font-size:.5rem;color:var(--text-muted);margin-top:2px;">T2</div>
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
                        <p>Dois graus por acorde · exibição como letras</p>
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
                Digite o grau em cada tempo · ex: <code>1</code> <code>5</code> <code>b3</code> <code>4</code> ·
                A nota aparece como letra abaixo · Grau relativo ao acorde (<code>3</code> em m7→b3) ·
                Tab=próximo acorde
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
                const ci   = +inp.dataset.ci;
                const slot = +inp.dataset.slot;
                _ensureSlots();
                if (slot === 0) _st.slots[ci].n1 = inp.value;
                else            _st.slots[ci].n2 = inp.value;
                C._refreshLetter(ci, slot);
            });

            grid?.addEventListener('keydown', e => {
                const inp = e.target.closest('.hb-deg-input');
                if (!inp) return;
                const ci   = +inp.dataset.ci;
                const slot = +inp.dataset.slot;
                if (e.key === 'Tab') {
                    e.preventDefault();
                    // Tab within card: slot 0 → slot 1; slot 1 → next card slot 0
                    if (slot === 0) {
                        document.querySelector(`.hb-deg-input[data-ci="${ci}"][data-slot="1"]`)?.focus();
                    } else {
                        const nextCi = e.shiftKey ? ci - 1 : ci + 1;
                        if (nextCi >= 0 && nextCi < _st.chords.length) {
                            document.querySelector(`.hb-deg-input[data-ci="${nextCi}"][data-slot="0"]`)?.focus();
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
            const gridEl   = document.getElementById('hb-chord-grid');
            const saveBar  = document.getElementById('hb-save-bar');
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

        _refreshLetter(ci, slotIdx) {
            const el = document.getElementById(`hb-letter-${ci}-${slotIdx}`);
            if (!el) return;
            const chord = _st.chords[ci];
            if (!chord) return;
            const deg = slotIdx === 0 ? _st.slots[ci].n1 : _st.slots[ci].n2;
            el.textContent = _degToLetter(deg, chord) || '—';
        },

        _setPlayHighlight(ci, slotIdx, active) {
            [0, 1].forEach(s => {
                const el = document.getElementById(`hb-letter-${ci}-${s}`);
                if (!el) return;
                const on = active && s === slotIdx;
                el.style.background = on ? 'var(--brand,#7c3aed)' : 'transparent';
                el.style.color      = on ? '#fff' : 'var(--chord-blue,#60a5fa)';
            });
        },

        // ── Playback ─────────────────────────────────────────────────────────

        _clearTimers() {
            _st.playTimers.forEach(clearTimeout);
            _st.playTimers = [];
        },

        _stopAll() {
            window.HMSAudio.stop();
            C._clearTimers();
            if (_st.playingCi !== null) {
                C._setPlayHighlight(_st.playingCi, _st.playingSlot, false);
            }
            _st.playing     = false;
            _st.playingCi   = null;
            _st.playingSlot = null;
            const btn = document.getElementById('hb-play-btn');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-play"></i> Tocar Linha';
                btn.className = 'btn btn-primary';
            }
        },

        _togglePlay() {
            if (_st.playing) { C._stopAll(); return; }

            // Build flat sequence: [{ci, slot, note, dur}]
            _ensureSlots();
            const dur = _slotDur();
            const seq = [];
            for (let ci = 0; ci < _st.chords.length; ci++) {
                const chord = _st.chords[ci];
                const s = _st.slots[ci] || { n1:'1', n2:'5' };
                [s.n1, s.n2].forEach((deg, slotIdx) => {
                    const note = _degToNote(deg, chord);
                    if (note) seq.push({ ci, slotIdx, note, dur });
                });
            }
            if (!seq.length) { window.HMSApp.showToast('Sem notas para tocar.', 'warning'); return; }

            _st.playing = true;
            const btn = document.getElementById('hb-play-btn');
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-stop"></i> Parar'; btn.className = 'btn btn-secondary'; }

            let cumMs = 0;
            seq.forEach(item => {
                const ms = _durToMs(item.dur, _st.bpm);
                const t = setTimeout(() => {
                    if (_st.playingCi !== null) C._setPlayHighlight(_st.playingCi, _st.playingSlot, false);
                    _st.playingCi   = item.ci;
                    _st.playingSlot = item.slotIdx;
                    C._setPlayHighlight(item.ci, item.slotIdx, true);
                }, cumMs);
                cumMs += ms;
                _st.playTimers.push(t);
            });

            _st.playTimers.push(setTimeout(() => C._stopAll(), cumMs + 100));
            window.HMSAudio.playMelody(seq.map(s => ({ note: s.note, dur: s.dur })), _st.bpm, () => C._stopAll(), _st.timeSig);
        },

        _playChord(ci) {
            if (_st.playing) C._stopAll();
            const chord = _st.chords[ci];
            if (!chord) return;
            _ensureSlots();
            const dur = _slotDur();
            const s = _st.slots[ci] || { n1:'1', n2:'5' };
            const notes = [s.n1, s.n2].map(deg => _degToNote(deg, chord)).filter(Boolean);
            if (!notes.length) return;

            _st.playing = true;
            let cumMs = 0;
            [0, 1].forEach(slotIdx => {
                const note = _degToNote(slotIdx === 0 ? s.n1 : s.n2, chord);
                if (!note) return;
                const ms = _durToMs(dur, _st.bpm);
                const t = setTimeout(() => {
                    if (_st.playingCi !== null) C._setPlayHighlight(_st.playingCi, _st.playingSlot, false);
                    _st.playingCi = ci; _st.playingSlot = slotIdx;
                    C._setPlayHighlight(ci, slotIdx, true);
                }, cumMs);
                cumMs += ms;
                _st.playTimers.push(t);
            });
            _st.playTimers.push(setTimeout(() => C._stopAll(), cumMs + 100));
            const seq = [0, 1].map(si => {
                const deg = si === 0 ? s.n1 : s.n2;
                return { note: _degToNote(deg, chord), dur };
            }).filter(n => n.note);
            window.HMSAudio.playMelody(seq, _st.bpm, () => C._stopAll(), _st.timeSig);
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
            // slots stored as string[] "deg1 deg2" per chord
            const raw = study.slots || [];
            _st.slots = raw.map(item => {
                const parts = String(item || '').trim().split(/\s+/);
                return { n1: parts[0] || '1', n2: parts[1] || '5' };
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
                    slots:    _st.slots.map(s => `${s.n1 || '1'} ${s.n2 || '5'}`),
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
