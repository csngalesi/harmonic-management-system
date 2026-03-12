/**
 * HMS — Estudo Harmônico Melódico (v2)
 * Frases melódicas sobre progressões harmônicas.
 * 8 slots por acorde · braço 7 cordas animado · pentagrama de contorno.
 * Exposed via window.HarmonicMelodicComponent
 */
(function () {
    'use strict';

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── Chord-Relative Degree Engine ─────────────────────────────────────────

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
            '1': '1', '2': '2',
            '3': (isMinor || isHalfDim || isDim) ? 'b3' : '3',
            '4': '4',
            '5': (isHalfDim || isDim) ? 'b5' : '5',
            '6': '6',
            '7': isMaj7 ? '7' : hasSeven ? 'b7' : '7',
        };
    }

    function _normalizeDeg(deg, chordName) {
        const { suffix } = _parseChordName(chordName);
        const qMap = _chordQualityMap(suffix);
        const m = deg.match(/^([b#]?)([1-7])$/);
        if (!m) return deg;
        return (!m[1] && qMap[m[2]]) ? qMap[m[2]] : deg;
    }

    // Parse slot text: "1", "b3", "#4", "5(-1)", "b3(1)"
    function _parseSlot(str) {
        if (!str || !str.trim()) return null;
        const m = str.trim().match(/^([b#]?[1-7])(?:\(([+-]?\d+)\))?$/);
        if (!m) return null;
        return { deg: m[1], oct: m[2] !== undefined ? parseInt(m[2]) : 0 };
    }

    // Resolve slot to absolute {note, dur} using chord-relative mapping
    function _resolveNote(slotStr, chordName, noteDur) {
        const parsed = _parseSlot(slotStr);
        if (!parsed) return null;
        try {
            const { root } = _parseChordName(chordName);
            const normDeg = _normalizeDeg(parsed.deg, chordName);
            const notes = window.MelodyEngine.translate(
                [{ deg: normDeg, oct: parsed.oct, dur: noteDur }], root
            );
            return notes[0] || null;
        } catch (_) { return null; }
    }

    function _durToMs(dur, bpm) {
        const beat = 60000 / bpm;
        return ({ '16n': beat / 4, '8n': beat / 2, '4n': beat, '2n': beat * 2 })[dur] ?? beat / 2;
    }

    // ── Constants ────────────────────────────────────────────────────────────

    const SLOTS = 8;

    // ── State ────────────────────────────────────────────────────────────────

    const _st = {
        root:        'C',
        isMinor:     false,
        harmonyStr:  '',
        noteDur:     '8n',
        bpm:         80,
        chords:      [],   // string[] from HarmonyEngine
        slots:       [],   // string[][] [chordIdx][slotIdx]
        focusedSlot: null, // { ci, si }
        playingSlot: null, // { ci, si } — during playback
        playing:     false,
        playTimers:  [],
        tab:         'editor',
        studies:     [],
        currentUserId: null,
        savingTitle: '',
    };

    function _ensureSlots() {
        while (_st.slots.length < _st.chords.length)
            _st.slots.push(Array(SLOTS).fill(''));
        _st.slots.length = _st.chords.length;
    }

    function _parseHarmony() {
        if (!_st.harmonyStr.trim()) { _st.chords = []; return; }
        try {
            const tokens = window.HarmonyEngine.translate(_st.harmonyStr, _st.root, _st.isMinor);
            _st.chords = tokens.filter(t => t.type === 'CHORD').map(t => t.value);
        } catch (_) { _st.chords = []; }
    }

    // Build flat sequence: { ci, si, note|null } for all slots
    function _buildSequence() {
        _ensureSlots();
        const seq = [];
        for (let ci = 0; ci < _st.chords.length; ci++) {
            for (let si = 0; si < SLOTS; si++) {
                const s = _st.slots[ci]?.[si] || '';
                seq.push({ ci, si, note: s.trim() ? _resolveNote(s, _st.chords[ci], _st.noteDur) : null });
            }
        }
        return seq;
    }

    function _currentFretMidi() {
        const active = _st.playingSlot || _st.focusedSlot;
        if (!active) return null;
        const chord = _st.chords[active.ci];
        if (!chord) return null;
        const s = _st.slots[active.ci]?.[active.si] || '';
        if (!s.trim()) return null;
        const n = _resolveNote(s, chord, _st.noteDur);
        return n ? Tone.Frequency(n.note).toMidi() : null;
    }

    // ── Fretboard SVG (single note) ──────────────────────────────────────────

    const FB_OPEN = [35, 40, 45, 50, 55, 59, 64]; // B1 E2 A2 D3 G3 B3 E4
    const FB_STR  = ['B', 'E', 'A', 'D', 'G', 'B', 'E'];
    const FB_FRETS = 7;

    function _fretboardSVG(midi) {
        const W = 420, H = 118, ML = 26, MR = 8, MT = 10, MB = 16;
        const neckW = W - ML - MR;
        const fretSp = neckW / FB_FRETS;
        const strSp  = (H - MT - MB) / 6;

        const positions = [];
        if (midi != null) {
            for (let s = 0; s < 7; s++)
                for (let f = 0; f <= FB_FRETS; f++)
                    if (FB_OPEN[s] + f === midi) positions.push({ s, f });
        }

        const p = [`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`];
        p.push(`<rect x="${ML}" y="${MT-3}" width="${neckW}" height="${H-MT-MB+6}" fill="var(--bg-raised)" rx="2" opacity="0.4"/>`);

        for (let s = 0; s < 7; s++) {
            const y = MT + s * strSp;
            const sw = (0.55 + (6 - s) * 0.22).toFixed(2);
            p.push(`<line x1="${ML}" y1="${y}" x2="${ML+neckW}" y2="${y}" stroke="var(--text-secondary)" stroke-width="${sw}" opacity="0.6"/>`);
            p.push(`<text x="${ML-4}" y="${y+4}" text-anchor="end" font-size="9" font-family="var(--font-mono)" fill="var(--text-muted)">${FB_STR[s]}</text>`);
        }
        p.push(`<line x1="${ML}" y1="${MT-5}" x2="${ML}" y2="${H-MB+5}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round"/>`);

        for (let f = 1; f <= FB_FRETS; f++) {
            const x = ML + f * fretSp;
            p.push(`<line x1="${x}" y1="${MT-3}" x2="${x}" y2="${H-MB+3}" stroke="var(--line-color)" stroke-width="1"/>`);
            p.push(`<text x="${x - fretSp/2}" y="${H-2}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${f}</text>`);
        }
        for (const mf of [1, 3, 5, 7]) {
            if (mf <= FB_FRETS) {
                const x = ML + (mf - 0.5) * fretSp;
                p.push(`<circle cx="${x}" cy="${MT + 3 * strSp}" r="3" fill="var(--text-muted)" opacity="0.15"/>`);
            }
        }

        if (!positions.length) {
            p.push(`<text x="${W/2}" y="${H/2+4}" text-anchor="middle" font-size="10" fill="var(--text-muted)" opacity="0.4">— foque um slot —</text>`);
        } else {
            const noteName = Tone.Frequency(midi, 'midi').toNote();
            p.push(`<text x="${W-ML}" y="13" text-anchor="end" font-size="11" font-family="var(--font-mono)" fill="var(--brand,#7c3aed)" font-weight="700">${esc(noteName)}</text>`);
            for (const pos of positions) {
                const cy = MT + pos.s * strSp;
                const cx = pos.f === 0 ? ML - 13 : ML + (pos.f - 0.5) * fretSp;
                if (pos.f === 0) {
                    p.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="var(--brand,#7c3aed)" stroke-width="2.5"/>`);
                    p.push(`<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="9" fill="var(--brand,#7c3aed)">○</text>`);
                } else {
                    p.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="var(--brand,#7c3aed)" opacity="0.9"/>`);
                    p.push(`<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="8" font-weight="700" fill="white">${pos.f}</text>`);
                }
            }
        }
        p.push('</svg>');
        return p.join('');
    }

    // ── Staff SVG (melodic contour) ──────────────────────────────────────────
    // X = absolute slot position; Y = pitch (linear MIDI mapping)
    // Staff lines placed at guitar sounding range (treble 8vb)

    function _staffSVG(seq, highlightAbsIdx) {
        const W = 700, H = 108;
        const xPad = 24, yTop = 12, yBot = H - 14;
        const midiMin = 33, midiMax = 78; // A1..F#5

        function midiToY(midi) {
            return yBot - (midi - midiMin) / (midiMax - midiMin) * (yBot - yTop);
        }

        const totalSlots = _st.chords.length * SLOTS;
        const slotW = totalSlots > 0 ? Math.max(8, (W - xPad * 2) / totalSlots) : 20;

        function slotX(ci, si) { return xPad + (ci * SLOTS + si) * slotW + slotW / 2; }

        // Guitar-range staff lines (sounding): E3 G3 B3 D4 F4
        const staffLineMidis = [52, 55, 59, 62, 65];

        const p = [`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`];

        // Staff lines
        for (const m of staffLineMidis) {
            const y = midiToY(m).toFixed(1);
            p.push(`<line x1="10" y1="${y}" x2="${W-10}" y2="${y}" stroke="var(--line-color)" stroke-width="1" opacity="0.7"/>`);
        }
        // Reference dashed lines: C2 C3 C4
        for (const [m, label] of [[36,'C2'],[48,'C3'],[60,'C4']]) {
            const y = midiToY(m).toFixed(1);
            p.push(`<line x1="10" y1="${y}" x2="${W-10}" y2="${y}" stroke="var(--text-muted)" stroke-width="0.5" stroke-dasharray="3,5" opacity="0.35"/>`);
            p.push(`<text x="3" y="${(+y+3).toFixed(1)}" font-size="7" fill="var(--text-muted)" opacity="0.5">${label}</text>`);
        }

        // Chord separator lines + labels
        for (let ci = 0; ci < _st.chords.length; ci++) {
            const x = (xPad + ci * SLOTS * slotW).toFixed(1);
            if (ci > 0) {
                p.push(`<line x1="${x}" y1="${yTop-4}" x2="${x}" y2="${yBot+4}" stroke="var(--line-color)" stroke-width="1.5" opacity="0.6"/>`);
            }
            const labelX = (+x + 3).toFixed(1);
            const { suffix } = _parseChordName(_st.chords[ci]);
            let color = 'var(--chord-blue,#60a5fa)';
            if (/^m(?!aj)/i.test(suffix)) color = 'var(--brand,#7c3aed)';
            if (/7/.test(suffix) && !/^m/i.test(suffix) && !/maj7|M7/.test(suffix)) color = 'var(--chord-amber,#fbbf24)';
            p.push(`<text x="${labelX}" y="${(yTop+1).toFixed(1)}" font-size="8" font-family="var(--font-mono)" fill="${color}" font-weight="700">${esc(_st.chords[ci])}</text>`);
        }

        // Collect note points (only non-null)
        const points = [];
        seq.forEach((item, absIdx) => {
            if (!item.note) return;
            const midi = Tone.Frequency(item.note.note).toMidi();
            points.push({ x: slotX(item.ci, item.si), y: midiToY(midi), midi, absIdx });
        });

        if (!points.length) {
            p.push(`<text x="${W/2}" y="${H/2+4}" text-anchor="middle" font-size="10" fill="var(--text-muted)" opacity="0.4">— sem notas —</text>`);
            p.push('</svg>');
            return p.join('');
        }

        // Contour line
        if (points.length > 1) {
            const d = points.map((pt, i) => `${i===0?'M':'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
            p.push(`<path d="${d}" fill="none" stroke="var(--brand,#7c3aed)" stroke-width="1.2" opacity="0.28"/>`);
        }

        // Note heads
        for (const pt of points) {
            const hi = pt.absIdx === highlightAbsIdx;
            const fill = hi ? 'var(--chord-amber,#fbbf24)' : 'var(--brand,#7c3aed)';
            const r = hi ? 6.5 : 5;
            p.push(`<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${r}" fill="${fill}" opacity="${hi ? 1 : 0.88}"/>`);
            if (hi) {
                const noteName = Tone.Frequency(pt.midi, 'midi').toNote();
                p.push(`<text x="${pt.x.toFixed(1)}" y="${(pt.y - 10).toFixed(1)}" text-anchor="middle" font-size="8" font-family="var(--font-mono)" fill="var(--chord-amber,#fbbf24)" font-weight="700">${esc(noteName)}</text>`);
            }
        }

        p.push('</svg>');
        return p.join('');
    }

    // ── Slot HTML ────────────────────────────────────────────────────────────

    function _slotHtml(ci, si) {
        _ensureSlots();
        const chord   = _st.chords[ci];
        const slotStr = _st.slots[ci]?.[si] || '';
        const isFoc   = _st.focusedSlot?.ci === ci && _st.focusedSlot?.si === si;
        const isPly   = _st.playingSlot?.ci === ci && _st.playingSlot?.si === si;

        let noteLabel = '—';
        if (slotStr.trim() && chord) {
            const resolved = _resolveNote(slotStr, chord, _st.noteDur);
            noteLabel = resolved ? resolved.note : '?';
        }

        const border = isPly ? 'var(--chord-amber,#fbbf24)' : isFoc ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
        const bg     = isPly ? 'rgba(251,191,36,.13)' : isFoc ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--bg-raised)';
        const noteColor = slotStr.trim() ? (isPly ? 'var(--chord-amber,#fbbf24)' : 'var(--chord-blue,#60a5fa)') : 'var(--text-muted)';

        return `
        <div class="hm-slot" data-ci="${ci}" data-si="${si}"
            style="width:46px;flex-shrink:0;border-radius:5px;border:1px solid ${border};
            background:${bg};padding:4px 2px 3px;display:flex;flex-direction:column;
            align-items:center;gap:1px;transition:border-color .12s,background .12s;">
            <span style="font-size:.58rem;color:var(--text-muted);line-height:1;">${si + 1}</span>
            <input class="hm-slot-input" data-ci="${ci}" data-si="${si}"
                value="${esc(slotStr)}" placeholder="—" maxlength="8"
                style="width:42px;background:transparent;border:none;outline:none;
                font-family:var(--font-mono);font-size:.8rem;font-weight:600;
                color:var(--text-primary);text-align:center;padding:1px 0;" />
            <span class="hm-slot-note" data-ci="${ci}" data-si="${si}"
                style="font-size:.6rem;color:${noteColor};font-family:var(--font-mono);white-space:nowrap;line-height:1.2;">${esc(noteLabel)}</span>
        </div>`;
    }

    // ── Chord Card HTML ───────────────────────────────────────────────────────

    function _chordCardHtml(chord, ci) {
        const { suffix } = _parseChordName(chord);
        let color = 'var(--chord-blue,#60a5fa)';
        if (/^m(?!aj)/i.test(suffix))                                        color = 'var(--brand,#7c3aed)';
        if (/7/.test(suffix) && !/^m/i.test(suffix) && !/maj7|M7/.test(suffix)) color = 'var(--chord-amber,#fbbf24)';
        if (/maj7|M7/.test(suffix))                                          color = 'var(--chord-green,#34d399)';

        const slots = Array.from({ length: SLOTS }, (_, si) => _slotHtml(ci, si)).join('');

        return `
        <div class="hm-chord-card" data-ci="${ci}"
            style="flex-shrink:0;border-radius:8px;border:1px solid var(--glass-border);
            background:var(--bg-surface);overflow:hidden;">
            <div style="padding:7px 10px 5px;display:flex;align-items:center;gap:8px;
                border-bottom:1px solid var(--line-color);background:var(--bg-raised);">
                <span style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:${color};">${esc(chord)}</span>
                <span style="font-size:.68rem;color:var(--text-muted);flex:1;">acorde ${ci + 1}</span>
                <button class="btn btn-ghost hm-play-chord" data-ci="${ci}"
                    style="padding:2px 8px;font-size:.75rem;">
                    <i class="fa-solid fa-play"></i>
                </button>
            </div>
            <div style="padding:7px 6px;display:flex;gap:3px;">
                ${slots}
            </div>
        </div>`;
    }

    // ── Editor HTML ───────────────────────────────────────────────────────────

    function _durLabel(d) {
        return { '16n': '♬ 16n', '8n': '♪ 8n', '4n': '♩ 4n' }[d] || d;
    }

    function _keyOptions() {
        const cur = _st.root + (_st.isMinor ? 'm' : '');
        return window.HarmonyEngine.allKeys().map(k =>
            `<option value="${k.value}" ${k.value === cur ? 'selected' : ''}>${esc(k.label)}</option>`
        ).join('');
    }

    function _editorHtml() {
        _ensureSlots();
        const hasChords = _st.chords.length > 0;
        const seq = _buildSequence();

        const chordsHtml = hasChords
            ? _st.chords.map((c, i) => _chordCardHtml(c, i)).join('')
            : `<div style="padding:2rem;color:var(--text-muted);white-space:nowrap;">
                <i class="fa-solid fa-music" style="font-size:1.4rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>
                Digite a harmonia acima.</div>`;

        return `
            <div class="page-header">
                <div class="page-title">
                    <div class="page-title-icon"><i class="fa-solid fa-guitar"></i></div>
                    <div>
                        <h2>Estudo Harmônico Melódico</h2>
                        <p>Frases melódicas sobre progressões — braço 7 cordas + pentagrama</p>
                    </div>
                </div>
            </div>

            <!-- Toolbar -->
            <div class="panel" style="margin-bottom:.75rem;padding:10px 14px;">
                <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">Tom</label>
                        <select class="form-select" id="hm-key-select" style="width:auto;">${_keyOptions()}</select>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:180px;">
                        <label style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;">Harmonia</label>
                        <input type="text" class="form-input" id="hm-harmony-input"
                            value="${esc(_st.harmonyStr)}"
                            placeholder="ex: Im7 IVm7 bVII7 III7"
                            style="flex:1;font-family:var(--font-mono);" />
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">Figura</label>
                        <select class="form-select" id="hm-dur-select" style="width:auto;">
                            ${['16n','8n','4n'].map(d =>
                                `<option value="${d}" ${_st.noteDur === d ? 'selected' : ''}>${_durLabel(d)}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">BPM</label>
                        <input type="number" class="form-input" id="hm-bpm"
                            value="${_st.bpm}" min="20" max="300" style="width:64px;text-align:center;" />
                    </div>
                    <button class="btn ${_st.playing ? 'btn-secondary' : 'btn-primary'}" id="hm-play-all">
                        <i class="fa-solid fa-${_st.playing ? 'stop' : 'play'}"></i>
                        ${_st.playing ? 'Parar' : 'Tocar Tudo'}
                    </button>
                </div>
            </div>

            <!-- Hint -->
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.75rem;padding:5px 10px;
                background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                Graus relativos ao acorde ·
                <code style="font-family:var(--font-mono);">3</code> em m7→b3 ·
                <code>7</code> em maj7→7ª maior ·
                Acidente explícito <code>b3</code> <code>#4</code>: absoluto da raiz ·
                Oitava: <code>5(-1)</code>=grave  <code>5(1)</code>=agudo
            </div>

            <!-- Chord grid -->
            <div id="hm-chord-grid"
                style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:.75rem;
                align-items:flex-start;">
                ${chordsHtml}
            </div>

            <!-- Staff -->
            <div class="panel" style="margin-bottom:.75rem;padding:8px 12px;">
                <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:3px;
                    font-weight:600;text-transform:uppercase;letter-spacing:.04em;">
                    Pentagrama — contorno melódico
                </div>
                <div id="hm-staff-display">${_staffSVG(seq)}</div>
            </div>

            <!-- Fretboard -->
            <div class="panel" style="margin-bottom:.75rem;padding:8px 12px;">
                <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:3px;
                    font-weight:600;text-transform:uppercase;letter-spacing:.04em;">
                    Braço 7 cordas — nota atual
                </div>
                <div id="hm-fretboard-display">${_fretboardSVG(_currentFretMidi())}</div>
            </div>

            <!-- Save bar -->
            <div id="hm-save-bar" class="panel"
                style="padding:10px 14px;display:${hasChords ? 'flex' : 'none'};gap:8px;align-items:center;">
                <input type="text" class="form-input" id="hm-save-title"
                    placeholder="Título para salvar este estudo…"
                    value="${esc(_st.savingTitle)}" style="flex:1;" />
                <button class="btn btn-primary" id="hm-btn-save">
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
                    <button class="hm-tab" data-tab="editor" style="${ts(_st.tab === 'editor')}">
                        <i class="fa-solid fa-pen-to-square"></i> Editor
                    </button>
                    <button class="hm-tab" data-tab="studies" style="${ts(_st.tab === 'studies')}">
                        <i class="fa-solid fa-folder-open"></i> Estudos Salvos
                    </button>
                </div>
                <div id="hm-tab-content"></div>
            `;

            document.querySelectorAll('.hm-tab').forEach(btn => {
                btn.addEventListener('click', e => { _st.tab = e.currentTarget.dataset.tab; C.render(); });
            });

            if (_st.tab === 'editor') C._renderEditor();
            else C._renderStudies();
        },

        // ── Editor ───────────────────────────────────────────────────────────

        _renderEditor() {
            document.getElementById('hm-tab-content').innerHTML = _editorHtml();
            C._bindEditorEvents();
        },

        _bindEditorEvents() {
            document.getElementById('hm-key-select')?.addEventListener('change', e => {
                const v = e.target.value;
                _st.root = v.endsWith('m') ? v.slice(0, -1) : v;
                _st.isMinor = v.endsWith('m');
                _parseHarmony();
                C._renderEditor();
            });

            document.getElementById('hm-harmony-input')?.addEventListener('input', e => {
                _st.harmonyStr = e.target.value;
                _parseHarmony();
                C._refreshChordGrid();
                C._updateStaff();
            });

            document.getElementById('hm-dur-select')?.addEventListener('change', e => {
                _st.noteDur = e.target.value;
                C._refreshAllSlotNotes();
                C._updateStaff();
                C._updateFretboard();
            });

            document.getElementById('hm-bpm')?.addEventListener('change', e => {
                _st.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _st.bpm;
            });

            document.getElementById('hm-play-all')?.addEventListener('click', () => C._togglePlayAll());

            const grid = document.getElementById('hm-chord-grid');

            // Slot input: update note label + staff
            grid?.addEventListener('input', e => {
                const inp = e.target.closest('.hm-slot-input');
                if (!inp) return;
                const ci = +inp.dataset.ci, si = +inp.dataset.si;
                _ensureSlots();
                if (!_st.slots[ci]) _st.slots[ci] = Array(SLOTS).fill('');
                _st.slots[ci][si] = inp.value;
                C._updateSlotNote(ci, si);
                C._updateStaff();
                C._updateFretboard();
            });

            // Slot focus: highlight + update fretboard
            grid?.addEventListener('focusin', e => {
                const inp = e.target.closest('.hm-slot-input');
                if (!inp) return;
                const ci = +inp.dataset.ci, si = +inp.dataset.si;
                const prev = _st.focusedSlot;
                _st.focusedSlot = { ci, si };
                if (prev) C._refreshSlotStyle(prev.ci, prev.si);
                C._refreshSlotStyle(ci, si);
                C._updateFretboard();
            });

            grid?.addEventListener('focusout', e => {
                const inp = e.target.closest('.hm-slot-input');
                if (!inp) return;
                setTimeout(() => {
                    if (!document.activeElement?.classList.contains('hm-slot-input')) {
                        _st.focusedSlot = null;
                        // fretboard keeps last note shown
                    }
                }, 80);
            });

            // Play chord button
            grid?.addEventListener('click', e => {
                const btn = e.target.closest('.hm-play-chord');
                if (btn) C._playChord(+btn.dataset.ci);
            });

            document.getElementById('hm-save-title')?.addEventListener('input', e => {
                _st.savingTitle = e.target.value;
            });
            document.getElementById('hm-btn-save')?.addEventListener('click', () => C._saveStudy());
        },

        _refreshChordGrid() {
            const gridEl    = document.getElementById('hm-chord-grid');
            const saveBarEl = document.getElementById('hm-save-bar');
            if (!gridEl) return;
            _ensureSlots();
            const hasChords = _st.chords.length > 0;
            gridEl.innerHTML = hasChords
                ? _st.chords.map((c, i) => _chordCardHtml(c, i)).join('')
                : `<div style="padding:2rem;color:var(--text-muted);white-space:nowrap;">
                    <i class="fa-solid fa-music" style="font-size:1.4rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>
                    Digite a harmonia acima.</div>`;
            if (saveBarEl) saveBarEl.style.display = hasChords ? 'flex' : 'none';
        },

        _updateSlotNote(ci, si) {
            const chord = _st.chords[ci];
            const s = _st.slots[ci]?.[si] || '';
            let noteLabel = '—';
            let noteColor = 'var(--text-muted)';
            if (s.trim() && chord) {
                const r = _resolveNote(s, chord, _st.noteDur);
                noteLabel = r ? r.note : '?';
                noteColor = 'var(--chord-blue,#60a5fa)';
            }
            const el = document.querySelector(`.hm-slot-note[data-ci="${ci}"][data-si="${si}"]`);
            if (el) { el.textContent = noteLabel; el.style.color = noteColor; }
        },

        _refreshAllSlotNotes() {
            for (let ci = 0; ci < _st.chords.length; ci++)
                for (let si = 0; si < SLOTS; si++)
                    C._updateSlotNote(ci, si);
        },

        _refreshSlotStyle(ci, si) {
            const el = document.querySelector(`.hm-slot[data-ci="${ci}"][data-si="${si}"]`);
            if (!el) return;
            const isPly = _st.playingSlot?.ci === ci && _st.playingSlot?.si === si;
            const isFoc = _st.focusedSlot?.ci  === ci && _st.focusedSlot?.si  === si;
            el.style.borderColor = isPly ? 'var(--chord-amber,#fbbf24)' : isFoc ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
            el.style.background  = isPly ? 'rgba(251,191,36,.13)' : isFoc ? 'var(--brand-dim,rgba(124,58,237,.12))' : 'var(--bg-raised)';
            const noteEl = document.querySelector(`.hm-slot-note[data-ci="${ci}"][data-si="${si}"]`);
            if (noteEl && isPly) noteEl.style.color = 'var(--chord-amber,#fbbf24)';
        },

        _updateStaff(highlightAbsIdx) {
            const el = document.getElementById('hm-staff-display');
            if (el) el.innerHTML = _staffSVG(_buildSequence(), highlightAbsIdx);
        },

        _updateFretboard() {
            const el = document.getElementById('hm-fretboard-display');
            if (el) el.innerHTML = _fretboardSVG(_currentFretMidi());
        },

        // ── Playback ─────────────────────────────────────────────────────────

        _clearTimers() {
            _st.playTimers.forEach(clearTimeout);
            _st.playTimers = [];
        },

        _stopAll() {
            window.HMSAudio.stop();
            C._clearTimers();
            const prev = _st.playingSlot;
            _st.playing = false;
            _st.playingSlot = null;
            if (prev) C._refreshSlotStyle(prev.ci, prev.si);
            C._updatePlayAllBtn();
            C._updateFretboard();
        },

        _togglePlayAll() {
            if (_st.playing) { C._stopAll(); return; }

            const seq       = _buildSequence();
            const playable  = seq.filter(s => s.note);
            if (!playable.length) { window.HMSApp.showToast('Sem notas para tocar.', 'warning'); return; }

            const notes  = playable.map(s => s.note);
            const durMs  = _durToMs(_st.noteDur, _st.bpm);

            _st.playing = true;
            C._updatePlayAllBtn();

            // Visual animation: one timer per playable note
            let prevSlot = null;
            playable.forEach((item, i) => {
                const t = setTimeout(() => {
                    if (prevSlot) C._refreshSlotStyle(prevSlot.ci, prevSlot.si);
                    _st.playingSlot = { ci: item.ci, si: item.si };
                    C._refreshSlotStyle(item.ci, item.si);
                    C._updateFretboard();
                    // Highlight on staff — find index among playable
                    C._updateStaff(i);
                    prevSlot = { ci: item.ci, si: item.si };
                }, i * durMs);
                _st.playTimers.push(t);
            });

            const cleanup = setTimeout(() => {
                C._stopAll();
                C._updateStaff(); // remove highlight
            }, playable.length * durMs + 120);
            _st.playTimers.push(cleanup);

            window.HMSAudio.playMelody(notes, _st.bpm, () => {
                C._stopAll();
                C._updateStaff();
            });
        },

        _playChord(ci) {
            const chord = _st.chords[ci];
            if (!chord) return;

            const items = [];
            for (let si = 0; si < SLOTS; si++) {
                const s = _st.slots[ci]?.[si] || '';
                if (s.trim()) {
                    const note = _resolveNote(s, chord, _st.noteDur);
                    if (note) items.push({ ci, si, note });
                }
            }
            if (!items.length) { window.HMSApp.showToast('Acorde sem notas.', 'warning'); return; }

            if (_st.playing) C._stopAll();

            const durMs = _durToMs(_st.noteDur, _st.bpm);
            _st.playing = true;

            let prev = null;
            items.forEach((item, i) => {
                const t = setTimeout(() => {
                    if (prev) C._refreshSlotStyle(prev.ci, prev.si);
                    _st.playingSlot = { ci: item.ci, si: item.si };
                    C._refreshSlotStyle(item.ci, item.si);
                    C._updateFretboard();
                    prev = { ci: item.ci, si: item.si };
                }, i * durMs);
                _st.playTimers.push(t);
            });

            _st.playTimers.push(setTimeout(() => C._stopAll(), items.length * durMs + 120));
            window.HMSAudio.playMelody(items.map(i => i.note), _st.bpm, () => C._stopAll());
        },

        _updatePlayAllBtn() {
            const btn = document.getElementById('hm-play-all');
            if (!btn) return;
            btn.innerHTML = `<i class="fa-solid fa-${_st.playing ? 'stop' : 'play'}"></i> ${_st.playing ? 'Parar' : 'Tocar Tudo'}`;
            btn.className = `btn ${_st.playing ? 'btn-secondary' : 'btn-primary'}`;
        },

        // ── Studies tab ──────────────────────────────────────────────────────

        _renderStudies() {
            document.getElementById('hm-tab-content').innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-folder-open"></i></div>
                        <div>
                            <h2>Estudos Harmônicos Salvos</h2>
                            <p>Progressões com frases melódicas</p>
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
            try {
                const user = await window.HMSAuth.currentUser();
                _st.currentUserId = user?.id || null;
                _st.studies = await window.HMSAPI.HarmonicStudies.getAll();
            } catch (_e) {
                window.HMSApp.showToast('Erro ao carregar estudos.', 'error');
                _st.studies = [];
            }
            C._renderStudiesList();
        },

        _renderStudiesList() {
            const listEl = document.getElementById('hm-studies-list');
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
                        <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${esc(keyLabel)} · ${s.bpm||80} BPM · ${_durLabel(s.note_dur||'8n')}</span>
                        <button class="btn btn-primary hm-load-study" data-id="${esc(s.id)}"
                            style="padding:4px 14px;font-size:.82rem;flex-shrink:0;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Carregar
                        </button>
                        ${isOwner ? `
                        <button class="btn btn-ghost hm-del-study" data-id="${esc(s.id)}"
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
            _st.noteDur     = study.note_dur || '8n';
            _st.savingTitle = study.title || '';
            _st.slots = Array.isArray(study.slots)
                ? study.slots.map(row => Array.isArray(row) ? [...row] : Array(SLOTS).fill(''))
                : [];
            _parseHarmony();
            _st.tab = 'editor';
            C.render();
            window.HMSApp.showToast(`"${study.title}" carregado.`, 'success');
        },

        _saveStudy: async function () {
            const title = (_st.savingTitle || '').trim();
            if (!title)                    { window.HMSApp.showToast('Informe um título.', 'warning'); return; }
            if (!_st.harmonyStr.trim())    { window.HMSApp.showToast('Harmonia vazia.', 'warning');   return; }
            _ensureSlots();
            try {
                await window.HMSAPI.HarmonicStudies.create({
                    title,
                    root:     _st.root,
                    is_minor: _st.isMinor,
                    harmony:  _st.harmonyStr,
                    bpm:      _st.bpm,
                    note_dur: _st.noteDur,
                    slots:    _st.slots,
                });
                window.HMSApp.showToast('Estudo salvo!', 'success');
                _st.savingTitle = '';
                const el = document.getElementById('hm-save-title');
                if (el) el.value = '';
            } catch (e) {
                window.HMSApp.showToast('Erro ao salvar: ' + (e.message || e), 'error');
            }
        },

        _deleteStudy: async function (id) {
            if (!confirm('Deletar este estudo?')) return;
            try {
                await window.HMSAPI.HarmonicStudies.delete(id);
                _st.studies = _st.studies.filter(s => s.id !== id);
                C._renderStudiesList();
                window.HMSApp.showToast('Estudo removido.', 'success');
            } catch (e) {
                window.HMSApp.showToast('Erro ao deletar: ' + (e.message || e), 'error');
            }
        },
    };

    window.HarmonicMelodicComponent = C;
    console.info('[HMS] HarmonicMelodicComponent v2 loaded.');
})();
