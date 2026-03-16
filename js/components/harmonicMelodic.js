/**
 * HMS — Estudo Harmônico Melódico (v3.2)
 * Um input de melodia por acorde · partitura real (clave + armadura) · braço 7 cordas C-tuning.
 * Radio chips de dur/oitava por acorde com auto-expand no Space.
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

    // Parse melody string: "1:4n b3:8n 5(-1):4n"
    // Token format: [b#]degree[(±oct)]:dur[~]
    // dur may be: 1n 2n 4n 8n 16n (normal) | 4t 8t 16t (tercinas) | omitted (default 8n)
    // ~ suffix = ligadura (tie to next note)
    function _parseMelodyStr(str, chordName) {
        if (!str || !str.trim()) return [];
        return str.trim().split(/\s+/).map(token => {
            const m = token.match(/^([b#]?[1-7])(?:\(([+-]?\d+)\))?(?::(1n|2n|4n|8n|16n|4t|8t|16t))?(~)?$/);
            if (!m) return null;
            const deg = _normalizeDeg(m[1], chordName);
            const oct = m[2] !== undefined ? parseInt(m[2]) : 0;
            const dur = m[3] || '8n';
            const obj = { deg, oct, dur };
            if (m[4] === '~') obj.tie = true;
            return obj;
        }).filter(Boolean);
    }

    function _resolveMelody(str, chordName) {
        const parsed = _parseMelodyStr(str, chordName);
        if (!parsed.length) return [];
        try {
            const { root } = _parseChordName(chordName);
            return window.MelodyEngine.translate(parsed, root) || [];
        } catch (_) { return []; }
    }

    function _durToMs(dur, bpm) {
        const beat = 60000 / bpm;
        const map = {
            '1n': beat * 4, '2n': beat * 2, '4n': beat, '8n': beat / 2, '16n': beat / 4,
            '4t': beat * 2 / 3, '8t': beat / 3, '16t': beat / 6,
        };
        return map[dur] ?? beat / 2;
    }

    // ── Harmonic Context Helpers ──────────────────────────────────────────────

    const _NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const _MAJOR_ST   = [0, 2, 4, 5, 7, 9, 11];
    const _MINOR_ST   = [0, 2, 3, 5, 7, 8, 10];

    // Root note of target degree X in the current key
    function _targetRoot(deg) {
        if (!deg) return null;
        const scale   = _st.isMinor ? _MINOR_ST : _MAJOR_ST;
        const idx     = parseInt(deg, 10) - 1;
        if (idx < 0 || idx > 6) return null;
        const rootIdx = _NOTE_NAMES.indexOf(_st.root);
        if (rootIdx === -1) return null;
        return _NOTE_NAMES[(rootIdx + scale[idx]) % 12];
    }

    // Whether degree X is minor-quality in the current key
    function _isMinorDeg(deg) {
        const n = parseInt(deg, 10);
        if (isNaN(n)) return false;
        return _st.isMinor ? [1, 2, 4].includes(n) : [2, 3, 6].includes(n);
    }

    // Map each chord index to its harmonic context.
    // 25(X) tags the next 3 chord slots with targetDeg=X.
    // 5(X)  tags the next 2 chord slots with targetDeg=X.
    function _buildChordMeta() {
        const meta      = _st.chords.map(() => ({ targetDeg: null }));
        const rawTokens = _st.harmonyStr.trim().split(/[\s|]+/).filter(Boolean);
        let ci = 0;
        for (const tok of rawTokens) {
            if (ci >= meta.length) break;
            if (tok === '/') { ci++; continue; }
            const m25 = tok.match(/^25\(([b#]?\d+)\)$/i);
            if (m25) {
                const deg = m25[1];
                for (let k = 0; k < 3 && ci + k < meta.length; k++) meta[ci + k].targetDeg = deg;
                ci += 3; continue;
            }
            const m5 = tok.match(/^5\(([b#]?\d+)\)$/i);
            if (m5) {
                const deg = m5[1];
                for (let k = 0; k < 2 && ci + k < meta.length; k++) meta[ci + k].targetDeg = deg;
                ci += 2; continue;
            }
            ci++;
        }
        return meta;
    }

    // ── Key Signature ─────────────────────────────────────────────────────────

    const KEY_SHARPS   = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6 };
    const MINOR_SHARPS = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6 };

    function _keySharps() {
        return (_st.isMinor ? MINOR_SHARPS : KEY_SHARPS)[_st.root] ?? 0;
    }

    // Staff diatonic offsets for accidentals in treble clef (guitar sounding pitch)
    // Reference: E3 = offset 0 (bottom line), each diatonic step = halfLineSpacing up
    // Sharps order: F C G D A E B  (F4, C4, G4, D4, A3, E4, B3)
    const SHARP_OFFS = [8, 5, 9, 6, 3, 7, 4];
    // Flats order:  B E A D G C F  (B3, E4, A3, D4, G3, C4, F3)
    const FLAT_OFFS  = [4, 7, 3, 6, 2, 5, 1];

    // ── State ────────────────────────────────────────────────────────────────

    const _st = {
        root:          'C',
        isMinor:       false,
        harmonyStr:    '',
        bpm:           80,
        timeSig:       '2/4',  // fórmula de compasso
        chords:        [],   // string[] from HarmonyEngine
        melodies:      [],   // string[] — one melody input per chord
        chordDefaults: [],   // {dur:'4n', oct:0}[] — defaults per chord for auto-expand
        chordMeta:     [],   // {targetDeg: string|null}[] — harmonic context per chord
        focusedCi:     null, // chord index with focused input
        playingIdx:    null, // absolute index in flatSeq during playback
        playing:       false,
        playingAll:    false,
        playTimers:    [],
        tab:           'editor',
        studies:       [],
        currentUserId: null,
        savingTitle:   '',
    };

    function _ensureMelodies() {
        while (_st.melodies.length < _st.chords.length) _st.melodies.push('');
        _st.melodies.length = _st.chords.length;
        while (_st.chordDefaults.length < _st.chords.length)
            _st.chordDefaults.push({ dur: '4n', oct: 0 });
        _st.chordDefaults.length = _st.chords.length;
        while (_st.chordMeta.length < _st.chords.length) _st.chordMeta.push({ targetDeg: null });
        _st.chordMeta.length = _st.chords.length;
    }

    function _parseHarmony() {
        if (!_st.harmonyStr.trim()) { _st.chords = []; _st.chordMeta = []; return; }
        try {
            const tokens = window.HarmonyEngine.translate(_st.harmonyStr, _st.root, _st.isMinor);
            _st.chords    = tokens.filter(t => t.type === 'CHORD').map(t => t.value);
            _st.chordMeta = _buildChordMeta();
        } catch (_) { _st.chords = []; _st.chordMeta = []; }
    }

    function _buildFlatSeq() {
        _ensureMelodies();
        const seq = [];
        for (let ci = 0; ci < _st.chords.length; ci++) {
            const notes = _resolveMelody(_st.melodies[ci] || '', _st.chords[ci]);
            for (let ni = 0; ni < notes.length; ni++) {
                seq.push({ ci, ni, note: notes[ni] });
            }
        }
        return seq;
    }

    function _currentFretMidi() {
        if (_st.playingIdx != null) {
            const seq = _buildFlatSeq();
            if (seq[_st.playingIdx]) {
                try { return Tone.Frequency(seq[_st.playingIdx].note.note).toMidi(); } catch (_) {}
            }
        }
        if (_st.focusedCi != null) {
            const chord = _st.chords[_st.focusedCi];
            if (chord) {
                const notes = _resolveMelody(_st.melodies[_st.focusedCi] || '', chord);
                if (notes.length) {
                    try { return Tone.Frequency(notes[0].note).toMidi(); } catch (_) {}
                }
            }
        }
        return null;
    }

    // ── Fretboard SVG (unchanged from v2) ────────────────────────────────────

    const FB_OPEN  = [36, 40, 45, 50, 55, 59, 64]; // C2 E2 A2 D3 G3 B3 E4
    const FB_STR   = ['C', 'E', 'A', 'D', 'G', 'B', 'E'];
    const FB_FRETS = 7;

    function _fretboardSVG(midi) {
        const W = 420, H = 118, ML = 26, MR = 8, MT = 10, MB = 16;
        const neckW = W - ML - MR, fretSp = neckW / FB_FRETS, strSp = (H - MT - MB) / 6;
        const positions = [];
        if (midi != null) {
            for (let s = 0; s < 7; s++)
                for (let f = 0; f <= FB_FRETS; f++)
                    if (FB_OPEN[s] + f === midi) positions.push({ s, f });
        }
        const p = [`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`];
        p.push(`<rect x="${ML}" y="${MT - 3}" width="${neckW}" height="${H - MT - MB + 6}" fill="var(--bg-raised)" rx="2" opacity="0.4"/>`);
        for (let s = 0; s < 7; s++) {
            const y = MT + s * strSp;
            const sw = (0.55 + (6 - s) * 0.22).toFixed(2);
            p.push(`<line x1="${ML}" y1="${y}" x2="${ML + neckW}" y2="${y}" stroke="var(--text-secondary)" stroke-width="${sw}" opacity="0.6"/>`);
            p.push(`<text x="${ML - 4}" y="${y + 4}" text-anchor="end" font-size="9" font-family="var(--font-mono)" fill="var(--text-muted)">${FB_STR[s]}</text>`);
        }
        p.push(`<line x1="${ML}" y1="${MT - 5}" x2="${ML}" y2="${H - MB + 5}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round"/>`);
        for (let f = 1; f <= FB_FRETS; f++) {
            const x = ML + f * fretSp;
            p.push(`<line x1="${x}" y1="${MT - 3}" x2="${x}" y2="${H - MB + 3}" stroke="var(--line-color)" stroke-width="1"/>`);
            p.push(`<text x="${x - fretSp / 2}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${f}</text>`);
        }
        for (const mf of [1, 3, 5, 7]) {
            if (mf <= FB_FRETS) {
                const x = ML + (mf - 0.5) * fretSp;
                p.push(`<circle cx="${x}" cy="${MT + 3 * strSp}" r="3" fill="var(--text-muted)" opacity="0.15"/>`);
            }
        }
        if (!positions.length) {
            p.push(`<text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" font-size="10" fill="var(--text-muted)" opacity="0.4">— foque um acorde —</text>`);
        } else {
            const noteName = Tone.Frequency(midi, 'midi').toNote();
            p.push(`<text x="${W - ML}" y="13" text-anchor="end" font-size="11" font-family="var(--font-mono)" fill="var(--brand,#7c3aed)" font-weight="700">${esc(noteName)}</text>`);
            for (const pos of positions) {
                const cy = MT + pos.s * strSp;
                const cx = pos.f === 0 ? ML - 13 : ML + (pos.f - 0.5) * fretSp;
                if (pos.f === 0) {
                    p.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="var(--brand,#7c3aed)" stroke-width="2.5"/>`);
                } else {
                    p.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="var(--brand,#7c3aed)" opacity="0.9"/>`);
                    p.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="8" font-weight="700" fill="white">${pos.f}</text>`);
                }
            }
        }
        p.push('</svg>');
        return p.join('');
    }

    // ── Staff SVG (proper score) ──────────────────────────────────────────────
    // Guitar treble clef 8vb: sounding E3 (MIDI 52) = bottom staff line (offset 0)
    // Staff offsets: offset = DIATONIC[letter] + octave*7 - 23
    // Staff lines at offsets 0(E3), 2(G3), 4(B3), 6(D4), 8(F4)

    const DIATONIC   = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
    const REF_OFFSET = 23; // DIATONIC['E'] + 3*7

    function _noteStaffOffset(noteName) {
        const m = noteName.match(/^([A-G])([b#]?)(-?\d+)$/);
        if (!m) return 4;
        return DIATONIC[m[1]] + parseInt(m[3]) * 7 - REF_OFFSET;
    }

    function _staffSVG(flatSeq, playingAbsIdx) {
        const LS     = 10;  // line spacing (px)
        const HLS    = 5;   // half line spacing = one diatonic step
        const H      = 152; // taller: guitar uses many ledger lines below
        const botY   = 78;  // Y of bottom staff line (E3) — less top margin
        const topY   = botY - 4 * LS; // Y of top staff line (F4)

        const ks      = _keySharps();
        const numAcc  = Math.abs(ks);
        const clefW   = 42;
        const keySigW = numAcc > 0 ? numAcc * 9 + 6 : 4;
        const initX   = clefW + keySigW;

        // Build per-chord data
        _ensureMelodies();
        const chordData = _st.chords.map((chord, ci) => ({
            chord,
            notes: _resolveMelody(_st.melodies[ci] || '', chord),
        }));

        const noteSpacing = 18;
        const measPadL    = 8;
        const minMeasW    = 52;
        const measWidths  = chordData.map(d => Math.max(minMeasW, d.notes.length * noteSpacing + measPadL + 6));
        const totalW      = initX + measWidths.reduce((a, b) => a + b, 0) + 14;
        const W           = Math.max(380, totalW);

        const p = [`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">`];

        // 5 staff lines
        for (let li = 0; li < 5; li++) {
            const y = botY - li * LS;
            p.push(`<line x1="4" y1="${y}" x2="${W - 4}" y2="${y}" stroke="var(--text-secondary)" stroke-width="0.9" opacity="0.45"/>`);
        }

        // Treble clef 𝄞 — curl on the G line (offset 2 = G3 = botY - LS)
        const clefBaseY = botY + 12;
        p.push(`<text x="3" y="${clefBaseY}" font-size="72" font-family="Bravura,FreeSerif,Times New Roman,serif" fill="var(--text-primary)" opacity="0.8">𝄞</text>`);

        // Key signature accidentals
        if (numAcc > 0) {
            const accChar = ks > 0 ? '♯' : '♭';
            const offsets = ks > 0 ? SHARP_OFFS : FLAT_OFFS;
            for (let i = 0; i < numAcc; i++) {
                const off = offsets[i];
                const ay  = botY - off * HLS;
                const ax  = clefW + 3 + i * 9;
                p.push(`<text x="${ax}" y="${ay + 5}" text-anchor="middle" font-size="13" fill="var(--text-primary)" opacity="0.7">${accChar}</text>`);
            }
        }

        // Opening barline
        p.push(`<line x1="${initX}" y1="${topY}" x2="${initX}" y2="${botY}" stroke="var(--text-secondary)" stroke-width="1" opacity="0.5"/>`);

        // Empty state
        if (!flatSeq.length) {
            p.push(`<text x="${(initX + W) / 2}" y="${botY - 2 * LS + 4}" text-anchor="middle" font-size="10" fill="var(--text-muted)" opacity="0.35">— sem notas —</text>`);
        }

        // Render each chord measure
        let absIdx = 0;
        let curX   = initX;

        chordData.forEach((d, ci) => {
            const mW    = measWidths[ci];
            const { chord, notes } = d;

            // Chord label above staff
            const { suffix } = _parseChordName(chord);
            let chordColor = 'var(--chord-blue,#60a5fa)';
            if (/^m(?!aj)/i.test(suffix))                                            chordColor = 'var(--brand,#7c3aed)';
            if (/7/.test(suffix) && !/^m/i.test(suffix) && !/maj7|M7/.test(suffix)) chordColor = 'var(--chord-amber,#fbbf24)';
            if (/maj7|M7/.test(suffix))                                              chordColor = 'var(--chord-green,#34d399)';
            p.push(`<text x="${curX + 4}" y="13" font-size="8.5" font-family="var(--font-mono)" fill="${chordColor}" font-weight="700">${esc(chord)}</text>`);

            // Note heads
            notes.forEach((n, ni) => {
                const noteX    = curX + measPadL + ni * noteSpacing + noteSpacing / 2;
                const off      = _noteStaffOffset(n.note);
                const noteY    = botY - off * HLS;
                const isPlay   = absIdx === playingAbsIdx;
                const noteCol  = isPlay ? 'var(--chord-amber,#fbbf24)' : 'var(--brand,#7c3aed)';
                const noteOp   = isPlay ? '1' : '0.88';
                const dur      = n.dur;

                // Ledger lines below staff (off < 0)
                if (off < 0) {
                    for (let lo = -2; lo >= off; lo -= 2) {
                        const ly = botY - lo * HLS;
                        p.push(`<line x1="${noteX - 7}" y1="${ly}" x2="${noteX + 7}" y2="${ly}" stroke="${noteCol}" stroke-width="1.2" opacity="0.55"/>`);
                    }
                }
                // Ledger lines above staff (off > 8)
                if (off > 8) {
                    const hiEnd = off % 2 === 0 ? off : off - 1;
                    for (let lo = 10; lo <= hiEnd; lo += 2) {
                        const ly = botY - lo * HLS;
                        p.push(`<line x1="${noteX - 7}" y1="${ly}" x2="${noteX + 7}" y2="${ly}" stroke="${noteCol}" stroke-width="1.2" opacity="0.55"/>`);
                    }
                }

                // Note head shape
                const isFilled = dur !== '2n' && dur !== '1n';
                const isWhole  = dur === '1n';

                if (isWhole) {
                    p.push(`<ellipse cx="${noteX}" cy="${noteY}" rx="5.5" ry="3.8" fill="none" stroke="${noteCol}" stroke-width="1.8" opacity="${noteOp}"/>`);
                } else if (isFilled) {
                    p.push(`<ellipse cx="${noteX}" cy="${noteY}" rx="4.8" ry="3.4" fill="${noteCol}" stroke="${noteCol}" stroke-width="1" opacity="${noteOp}" transform="rotate(-18,${noteX},${noteY})"/>`);
                } else {
                    // half note: open oval
                    p.push(`<ellipse cx="${noteX}" cy="${noteY}" rx="4.8" ry="3.4" fill="none" stroke="${noteCol}" stroke-width="1.8" opacity="${noteOp}" transform="rotate(-18,${noteX},${noteY})"/>`);
                }

                // Stem + flags (not for whole notes)
                if (!isWhole) {
                    const stemUp = off < 4;
                    const stemX  = stemUp ? noteX + 4.5 : noteX - 4.5;
                    const stemY1 = stemUp ? noteY - 3 : noteY + 3;
                    const stemY2 = stemUp ? noteY - 30 : noteY + 30;
                    p.push(`<line x1="${stemX}" y1="${stemY1}" x2="${stemX}" y2="${stemY2}" stroke="${noteCol}" stroke-width="1.2" opacity="${noteOp}"/>`);

                    const flags = dur === '8n' ? 1 : dur === '16n' ? 2 : 0;
                    for (let fi = 0; fi < flags; fi++) {
                        const fy   = stemUp ? stemY2 + fi * 9 : stemY2 - fi * 9;
                        const fDir = stemUp ? 1 : -1;
                        p.push(`<path d="M${stemX},${fy} Q${stemX + 12 * fDir},${fy + 9 * fDir} ${stemX + 5 * fDir},${fy + 18 * fDir}" fill="none" stroke="${noteCol}" stroke-width="1.3" opacity="${noteOp}"/>`);
                    }
                }

                // Note name label when playing
                if (isPlay) {
                    p.push(`<text x="${noteX}" y="${H - 4}" text-anchor="middle" font-size="7.5" font-family="var(--font-mono)" fill="var(--chord-amber,#fbbf24)" font-weight="700">${esc(n.note)}</text>`);
                }

                absIdx++;
            });

            // Barline
            curX += mW;
            p.push(`<line x1="${curX}" y1="${topY}" x2="${curX}" y2="${botY}" stroke="var(--text-secondary)" stroke-width="1" opacity="0.5"/>`);
        });

        // Double barline at end
        if (_st.chords.length > 0) {
            p.push(`<line x1="${curX + 3}" y1="${topY}" x2="${curX + 3}" y2="${botY}" stroke="var(--text-secondary)" stroke-width="2.8" opacity="0.65"/>`);
        }

        p.push('</svg>');
        return p.join('');
    }

    // ── Chord Card HTML ───────────────────────────────────────────────────────

    function _chordColor(suffix) {
        if (/maj7|M7/.test(suffix))                                            return 'var(--chord-green,#34d399)';
        if (/^m(?!aj)/i.test(suffix))                                          return 'var(--brand,#7c3aed)';
        if (/7/.test(suffix) && !/^m/i.test(suffix) && !/maj7|M7/.test(suffix)) return 'var(--chord-amber,#fbbf24)';
        return 'var(--chord-blue,#60a5fa)';
    }

    function _chipBtn(label, active, extraAttrs, title) {
        const bg  = active ? 'var(--brand,#7c3aed)' : 'var(--bg-raised)';
        const col = active ? '#fff' : 'var(--text-muted)';
        const brd = active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
        return `<button ${extraAttrs} title="${esc(title || label)}"
            style="padding:1px 6px;font-size:.68rem;font-family:var(--font-mono);border-radius:4px;
            border:1px solid ${brd};background:${bg};color:${col};cursor:pointer;line-height:1.5;
            font-weight:${active ? '700' : '400'};">${esc(label)}</button>`;
    }

    function _chordCardHtml(chord, ci) {
        _ensureMelodies();
        const { suffix }  = _parseChordName(chord);
        const color       = _chordColor(suffix);
        const melody      = _st.melodies[ci] || '';
        const isFocused   = _st.focusedCi === ci;
        const border      = isFocused ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
        const bg          = isFocused ? 'var(--brand-dim,rgba(124,58,237,.08))' : 'var(--bg-surface)';
        const def         = _st.chordDefaults[ci] || { dur: '4n', oct: 0 };
        const meta        = _st.chordMeta[ci] || { targetDeg: null };
        const tgtRoot     = meta.targetDeg ? _targetRoot(meta.targetDeg) : null;
        const tgtMinor    = meta.targetDeg ? _isMinorDeg(meta.targetDeg) : false;
        const tgtLabel    = tgtRoot ? tgtRoot + (tgtMinor ? 'm' : '') : null;
        const noteColor   = tgtLabel ? 'var(--chord-amber,#fbbf24)' : 'var(--chord-blue,#60a5fa)';

        const notes   = _resolveMelody(melody, chord);
        const preview = notes.length
            ? notes.map(n =>
                `<span style="font-size:.6rem;font-family:var(--font-mono);color:${noteColor};` +
                `padding:1px 4px;background:var(--bg-raised);border-radius:3px;">${esc(n.note)}${n.tie ? '⌒' : ''}</span>`
              ).join(' ')
            : `<span style="font-size:.6rem;color:var(--text-muted);">—</span>`;

        // Dur chips: 2n 4n 8n 16n
        const durChips = ['2n', '4n', '8n', '16n'].map(d =>
            _chipBtn(d, def.dur === d, `class="hm-dur-btn" data-ci="${ci}" data-dur="${d}"`,
                { '2n': 'Mínima', '4n': 'Semínima', '8n': 'Colcheia', '16n': 'Semicolcheia' }[d])
        ).join('');

        // Oct chips: -1  0  +1
        const octChips = [[-1, '-1'], [0, '0'], [1, '+1']].map(([v, label]) =>
            _chipBtn(label, def.oct === v, `class="hm-oct-btn" data-ci="${ci}" data-oct="${v}"`,
                { '-1': 'Oitava grave', '0': 'Oitava padrão', '1': 'Oitava aguda' }[v])
        ).join('');

        return `
        <div class="hm-chord-card" data-ci="${ci}"
            style="flex-shrink:0;min-width:172px;max-width:280px;border-radius:8px;
            border:1px solid ${border};background:${bg};overflow:hidden;
            transition:border-color .12s,background .12s;">
            <div style="padding:7px 10px 5px;display:flex;align-items:center;gap:8px;
                border-bottom:1px solid var(--line-color);background:var(--bg-raised);">
                <span style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:${color};">${esc(chord)}</span>
                <span style="font-size:.68rem;color:var(--text-muted);">acorde ${ci + 1}</span>
                ${tgtLabel ? `<span style="font-size:.6rem;font-family:var(--font-mono);color:var(--chord-amber,#fbbf24);background:rgba(251,191,36,.12);border-radius:3px;padding:1px 5px;">→ ${esc(tgtLabel)}</span>` : ''}
                <span style="flex:1;"></span>
                <button class="btn btn-ghost hm-play-chord" data-ci="${ci}"
                    style="padding:2px 8px;font-size:.75rem;">
                    <i class="fa-solid fa-play"></i>
                </button>
            </div>
            <div style="padding:7px 8px 3px;">
                <input class="hm-melody-input" data-ci="${ci}"
                    value="${esc(melody)}"
                    placeholder="ex: 1 b3 5  (Space expande)"
                    style="width:100%;box-sizing:border-box;background:transparent;
                    border:none;outline:none;font-family:var(--font-mono);font-size:.8rem;
                    font-weight:600;color:var(--text-primary);padding:2px 0;" />
                <div class="hm-notes-preview" data-ci="${ci}"
                    style="display:flex;flex-wrap:wrap;gap:2px;margin-top:4px;min-height:16px;">
                    ${preview}
                </div>
            </div>
            <div style="padding:4px 8px 7px;display:flex;align-items:center;gap:4px;
                border-top:1px solid var(--line-color);margin-top:3px;">
                <span style="font-size:.6rem;color:var(--text-muted);margin-right:1px;">Dur</span>
                ${durChips}
                <span style="font-size:.6rem;color:var(--text-muted);margin-left:6px;margin-right:1px;">8va</span>
                ${octChips}
            </div>
        </div>`;
    }

    // ── Editor HTML ───────────────────────────────────────────────────────────

    function _keyOptions() {
        const cur = _st.root + (_st.isMinor ? 'm' : '');
        return window.HarmonyEngine.allKeys().map(k =>
            `<option value="${k.value}" ${k.value === cur ? 'selected' : ''}>${esc(k.label)}</option>`
        ).join('');
    }

    function _editorHtml() {
        _ensureMelodies();
        const hasChords = _st.chords.length > 0;
        const flatSeq   = _buildFlatSeq();

        const chordsHtml = hasChords
            ? _st.chords.map((c, i) => _chordCardHtml(c, i)).join('')
            : `<div style="padding:2rem;color:var(--text-muted);white-space:nowrap;">
                <i class="fa-solid fa-music" style="font-size:1.4rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>
                Digite a harmonia acima.</div>`;

        const keyLabel = _st.root + (_st.isMinor ? 'm' : '') + ' ' + (_st.isMinor ? 'Menor' : 'Maior');

        return `
            <div class="page-header">
                <div class="page-title">
                    <div class="page-title-icon"><i class="fa-solid fa-guitar"></i></div>
                    <div>
                        <h2>Estudo Harmônico Melódico</h2>
                        <p>Frases melódicas sobre progressões — braço 7 cordas + partitura</p>
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
                        <label style="font-size:.75rem;color:var(--text-muted);">BPM</label>
                        <input type="number" class="form-input" id="hm-bpm"
                            value="${_st.bpm}" min="20" max="300" style="width:64px;text-align:center;" />
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <label style="font-size:.75rem;color:var(--text-muted);">Compasso</label>
                        <select class="form-select" id="hm-timesig-select" style="width:auto;">
                            <option value="2/4" ${_st.timeSig === '2/4' ? 'selected' : ''}>2/4</option>
                            <option value="3/4" ${_st.timeSig === '3/4' ? 'selected' : ''}>3/4</option>
                            <option value="4/4" ${_st.timeSig === '4/4' ? 'selected' : ''}>4/4</option>
                            <option value="6/8" ${_st.timeSig === '6/8' ? 'selected' : ''}>6/8</option>
                        </select>
                    </div>
                    <button class="btn ${_st.playing ? 'btn-secondary' : 'btn-primary'}" id="hm-play-melody">
                        <i class="fa-solid fa-${_st.playing ? 'stop' : 'play'}"></i>
                        ${_st.playing ? 'Parar' : 'Tocar Melodia'}
                    </button>
                    <button class="btn ${_st.playingAll ? 'btn-secondary' : 'btn-primary'}" id="hm-play-all">
                        <i class="fa-solid fa-${_st.playingAll ? 'stop' : 'music'}"></i>
                        ${_st.playingAll ? 'Parar' : 'Tocar Tudo'}
                    </button>
                </div>
            </div>

            <!-- Hint -->
            <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.75rem;padding:5px 10px;
                background:var(--bg-raised);border-radius:var(--radius-sm);border-left:3px solid var(--brand);">
                Grau:duração por espaço ·
                <code style="font-family:var(--font-mono);">1:4n</code>
                <code style="font-family:var(--font-mono);">b3:8n</code>
                <code style="font-family:var(--font-mono);">5(-1):4n</code> ·
                Grau relativo ao acorde (<code>3</code> em m7→b3) ·
                Oitava: <code>5(-1)</code>=grave · Durações: <code>16n 8n 4n 2n 1n</code> ·
                Tercinas: <code style="font-family:var(--font-mono);">8t 4t 16t</code> ·
                Ligadura: sufixo <code style="font-family:var(--font-mono);">~</code>
                ex: <code style="font-family:var(--font-mono);">b3:4n~ b3:8n</code> ·
                Atalhos no card: <code>z/x</code>=Dur ◀▶ · <code>n/m</code>=8va ◀▶ · <code>Tab</code>=próximo acorde
            </div>

            <!-- Chord grid -->
            <div id="hm-chord-grid"
                style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:.75rem;
                align-items:flex-start;">
                ${chordsHtml}
            </div>

            <!-- Staff -->
            <div class="panel" style="margin-bottom:.75rem;padding:8px 12px;overflow-x:auto;">
                <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:3px;
                    font-weight:600;text-transform:uppercase;letter-spacing:.04em;">
                    Partitura · Clave de Sol · ${esc(keyLabel)}
                </div>
                <div id="hm-staff-display">${_staffSVG(flatSeq)}</div>
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
                _st.root    = v.endsWith('m') ? v.slice(0, -1) : v;
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

            document.getElementById('hm-bpm')?.addEventListener('change', e => {
                _st.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 80));
                e.target.value = _st.bpm;
            });

            document.getElementById('hm-timesig-select')?.addEventListener('change', e => {
                _st.timeSig = e.target.value;
            });

            document.getElementById('hm-play-melody')?.addEventListener('click', () => C._togglePlayAll());
            document.getElementById('hm-play-all')?.addEventListener('click', () => C._togglePlayAllWithChords());

            const grid = document.getElementById('hm-chord-grid');

            grid?.addEventListener('input', e => {
                const inp = e.target.closest('.hm-melody-input');
                if (!inp) return;
                const ci = +inp.dataset.ci;
                _ensureMelodies();
                _st.melodies[ci] = inp.value;
                C._updateNotesPreview(ci);
                C._updateStaff();
                C._updateFretboard();
            });

            // Keyboard shortcuts on melody inputs
            // Space → auto-expand bare degree ("b3" → "b3(-1):4n")
            // z/x  → Dur left/right  (2n ← 4n ← 8n ← 16n)
            // n/m  → 8va left/right  (-1 ← 0 ← +1)
            // Tab  → move to next card (Shift+Tab = previous)
            const _DUR_OPT = ['2n', '4n', '8n', '16n'];
            const _OCT_OPT = [-1, 0, 1];

            grid?.addEventListener('keydown', e => {
                const inp = e.target.closest('.hm-melody-input');
                if (!inp) return;
                const ci = +inp.dataset.ci;

                // Tab → jump between cards
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const nextCi = e.shiftKey ? ci - 1 : ci + 1;
                    if (nextCi >= 0 && nextCi < _st.chords.length) {
                        document.querySelector(`.hm-melody-input[data-ci="${nextCi}"]`)?.focus();
                    }
                    return;
                }

                if (e.ctrlKey || e.metaKey || e.altKey) return;

                // z/x → Dur; n/m → 8va
                if (['z', 'x', 'n', 'm'].includes(e.key)) {
                    e.preventDefault();
                    _ensureMelodies();
                    const def = _st.chordDefaults[ci] || { dur: '4n', oct: 0 };
                    if (e.key === 'z' || e.key === 'x') {
                        const idx    = _DUR_OPT.indexOf(def.dur);
                        const newIdx = e.key === 'z'
                            ? Math.max(0, idx - 1)
                            : Math.min(_DUR_OPT.length - 1, idx + 1);
                        _st.chordDefaults[ci].dur = _DUR_OPT[newIdx];
                    } else {
                        const idx    = _OCT_OPT.indexOf(def.oct);
                        const newIdx = e.key === 'n'
                            ? Math.max(0, idx - 1)
                            : Math.min(_OCT_OPT.length - 1, idx + 1);
                        _st.chordDefaults[ci].oct = _OCT_OPT[newIdx];
                    }
                    C._refreshCardDefaults(ci);
                    return;
                }

                // Space → auto-expand bare degree
                if (e.key === ' ') {
                    const pos     = inp.selectionStart;
                    const before  = inp.value.slice(0, pos);
                    const lastTok = before.trimEnd().split(/\s+/).pop() || '';
                    if (!/^[b#]?[1-7]$/.test(lastTok)) return;
                    e.preventDefault();
                    const def     = _st.chordDefaults[ci] || { dur: '4n', oct: 0 };
                    const octStr  = def.oct !== 0 ? `(${def.oct > 0 ? '+' : ''}${def.oct})` : '';
                    const expanded = lastTok + octStr + ':' + def.dur;
                    const insertAt = before.lastIndexOf(lastTok);
                    const newVal   = inp.value.slice(0, insertAt) + expanded + ' ' + inp.value.slice(pos);
                    inp.value = newVal;
                    inp.selectionStart = inp.selectionEnd = insertAt + expanded.length + 1;
                    _ensureMelodies();
                    _st.melodies[ci] = newVal;
                    C._updateNotesPreview(ci);
                    C._updateStaff();
                    C._updateFretboard();
                }
            });

            grid?.addEventListener('focusin', e => {
                const inp = e.target.closest('.hm-melody-input');
                if (!inp) return;
                const ci   = +inp.dataset.ci;
                const prev = _st.focusedCi;
                _st.focusedCi = ci;
                if (prev !== null && prev !== ci) C._refreshCardStyle(prev);
                C._refreshCardStyle(ci);
                C._updateFretboard();
            });

            grid?.addEventListener('focusout', e => {
                const inp = e.target.closest('.hm-melody-input');
                if (!inp) return;
                setTimeout(() => {
                    if (!document.activeElement?.classList.contains('hm-melody-input')) {
                        _st.focusedCi = null;
                        C._updateFretboard();
                    }
                }, 80);
            });

            grid?.addEventListener('click', e => {
                const playBtn = e.target.closest('.hm-play-chord');
                const durBtn  = e.target.closest('.hm-dur-btn');
                const octBtn  = e.target.closest('.hm-oct-btn');
                if (playBtn) { C._playChord(+playBtn.dataset.ci); return; }
                if (durBtn) {
                    const ci = +durBtn.dataset.ci;
                    _ensureMelodies();
                    _st.chordDefaults[ci].dur = durBtn.dataset.dur;
                    C._refreshCardDefaults(ci);
                    return;
                }
                if (octBtn) {
                    const ci = +octBtn.dataset.ci;
                    _ensureMelodies();
                    _st.chordDefaults[ci].oct = +octBtn.dataset.oct;
                    C._refreshCardDefaults(ci);
                    return;
                }
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
            _ensureMelodies();
            const hasChords = _st.chords.length > 0;
            gridEl.innerHTML = hasChords
                ? _st.chords.map((c, i) => _chordCardHtml(c, i)).join('')
                : `<div style="padding:2rem;color:var(--text-muted);white-space:nowrap;">
                    <i class="fa-solid fa-music" style="font-size:1.4rem;opacity:.3;display:block;margin-bottom:.5rem;"></i>
                    Digite a harmonia acima.</div>`;
            if (saveBarEl) saveBarEl.style.display = hasChords ? 'flex' : 'none';
        },

        _updateNotesPreview(ci) {
            const el    = document.querySelector(`.hm-notes-preview[data-ci="${ci}"]`);
            if (!el) return;
            const chord = _st.chords[ci];
            if (!chord) return;
            const notes     = _resolveMelody(_st.melodies[ci] || '', chord);
            const meta      = _st.chordMeta[ci] || { targetDeg: null };
            const tgtRoot   = meta.targetDeg ? _targetRoot(meta.targetDeg) : null;
            const tgtMinor  = meta.targetDeg ? _isMinorDeg(meta.targetDeg) : false;
            const tgtLabel  = tgtRoot ? tgtRoot + (tgtMinor ? 'm' : '') : null;
            const noteColor = tgtLabel ? 'var(--chord-amber,#fbbf24)' : 'var(--chord-blue,#60a5fa)';
            el.innerHTML = notes.length
                ? notes.map(n =>
                    `<span style="font-size:.6rem;font-family:var(--font-mono);color:${noteColor};` +
                    `padding:1px 4px;background:var(--bg-raised);border-radius:3px;">${esc(n.note)}${n.tie ? '⌒' : ''}</span>`
                  ).join(' ')
                : `<span style="font-size:.6rem;color:var(--text-muted);">—</span>`;
        },

        _refreshCardStyle(ci) {
            const el = document.querySelector(`.hm-chord-card[data-ci="${ci}"]`);
            if (!el) return;
            const isFoc      = _st.focusedCi === ci;
            el.style.borderColor = isFoc ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
            el.style.background  = isFoc ? 'var(--brand-dim,rgba(124,58,237,.08))' : 'var(--bg-surface)';
        },

        _refreshCardDefaults(ci) {
            const def = _st.chordDefaults[ci] || { dur: '4n', oct: 0 };
            // Update dur chips
            document.querySelectorAll(`.hm-dur-btn[data-ci="${ci}"]`).forEach(btn => {
                const active = btn.dataset.dur === def.dur;
                btn.style.background   = active ? 'var(--brand,#7c3aed)' : 'var(--bg-raised)';
                btn.style.color        = active ? '#fff' : 'var(--text-muted)';
                btn.style.borderColor  = active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
                btn.style.fontWeight   = active ? '700' : '400';
            });
            // Update oct chips
            document.querySelectorAll(`.hm-oct-btn[data-ci="${ci}"]`).forEach(btn => {
                const active = +btn.dataset.oct === def.oct;
                btn.style.background   = active ? 'var(--brand,#7c3aed)' : 'var(--bg-raised)';
                btn.style.color        = active ? '#fff' : 'var(--text-muted)';
                btn.style.borderColor  = active ? 'var(--brand,#7c3aed)' : 'var(--glass-border,rgba(255,255,255,.08))';
                btn.style.fontWeight   = active ? '700' : '400';
            });
        },

        _updateStaff(playingAbsIdx) {
            const el = document.getElementById('hm-staff-display');
            if (el) el.innerHTML = _staffSVG(_buildFlatSeq(), playingAbsIdx);
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
            _st.playing    = false;
            _st.playingAll = false;
            _st.playingIdx = null;
            C._updatePlayAllBtn();
            C._updateStaff();
            C._updateFretboard();
        },

        _togglePlayAll() {
            if (_st.playing || _st.playingAll) { C._stopAll(); return; }

            const seq = _buildFlatSeq();
            if (!seq.length) { window.HMSApp.showToast('Sem notas para tocar.', 'warning'); return; }

            _st.playing = true;
            C._updatePlayAllBtn();

            // Per-note timed animation (supports mixed durations)
            let cumMs = 0;
            seq.forEach((item, i) => {
                const ms = _durToMs(item.note.dur, _st.bpm);
                const t  = setTimeout(() => {
                    _st.playingIdx = i;
                    C._updateStaff(i);
                    C._updateFretboard();
                }, cumMs);
                cumMs += ms;
                _st.playTimers.push(t);
            });

            _st.playTimers.push(setTimeout(() => C._stopAll(), cumMs + 120));
            window.HMSAudio.playMelody(seq.map(s => s.note), _st.bpm, () => C._stopAll(), _st.timeSig);
        },

        _togglePlayAllWithChords() {
            if (_st.playing || _st.playingAll) { C._stopAll(); return; }

            const seq = _buildFlatSeq();
            if (!seq.length) { window.HMSApp.showToast('Sem notas para tocar.', 'warning'); return; }

            // Build chord timings aligned with actual melody note durations
            const chordTimings = [];
            let cumSec = 0;
            for (let ci = 0; ci < _st.chords.length; ci++) {
                const melNotes = _resolveMelody(_st.melodies[ci] || '', _st.chords[ci]);
                const durSec = melNotes.reduce((sum, n) => sum + _durToMs(n.dur, _st.bpm) / 1000, 0);
                if (_st.chords[ci]) {
                    chordTimings.push({ time: cumSec, chord: _st.chords[ci], duration: durSec || (60 / _st.bpm) });
                }
                cumSec += durSec || (60 / _st.bpm);
            }

            _st.playingAll = true;
            C._updatePlayAllBtn();

            let cumMs = 0;
            seq.forEach((item, i) => {
                const ms = _durToMs(item.note.dur, _st.bpm);
                const t  = setTimeout(() => {
                    _st.playingIdx = i;
                    C._updateStaff(i);
                    C._updateFretboard();
                }, cumMs);
                cumMs += ms;
                _st.playTimers.push(t);
            });

            _st.playTimers.push(setTimeout(() => C._stopAll(), cumMs + 120));
            window.HMSAudio.playAllWithTimings(seq.map(s => s.note), chordTimings, _st.bpm, () => C._stopAll());
        },

        _playChord(ci) {
            const chord = _st.chords[ci];
            if (!chord) return;
            const notes = _resolveMelody(_st.melodies[ci] || '', chord);
            if (!notes.length) { window.HMSApp.showToast('Acorde sem notas.', 'warning'); return; }

            if (_st.playing) C._stopAll();

            // Compute absolute offset for this chord's notes in the flat sequence
            let absOffset = 0;
            for (let i = 0; i < ci; i++) {
                absOffset += _resolveMelody(_st.melodies[i] || '', _st.chords[i]).length;
            }

            _st.playing = true;
            let cumMs = 0;
            notes.forEach((n, ni) => {
                const ms = _durToMs(n.dur, _st.bpm);
                const t  = setTimeout(() => {
                    _st.playingIdx = absOffset + ni;
                    C._updateStaff(absOffset + ni);
                    C._updateFretboard();
                }, cumMs);
                cumMs += ms;
                _st.playTimers.push(t);
            });

            _st.playTimers.push(setTimeout(() => C._stopAll(), cumMs + 120));
            window.HMSAudio.playMelody(notes, _st.bpm, () => C._stopAll(), _st.timeSig);
        },

        _updatePlayAllBtn() {
            const melBtn = document.getElementById('hm-play-melody');
            if (melBtn) {
                melBtn.innerHTML = `<i class="fa-solid fa-${_st.playing ? 'stop' : 'play'}"></i> ${_st.playing ? 'Parar' : 'Tocar Melodia'}`;
                melBtn.className = `btn ${_st.playing ? 'btn-secondary' : 'btn-primary'}`;
            }
            const allBtn = document.getElementById('hm-play-all');
            if (allBtn) {
                allBtn.innerHTML = `<i class="fa-solid fa-${_st.playingAll ? 'stop' : 'music'}"></i> ${_st.playingAll ? 'Parar' : 'Tocar Tudo'}`;
                allBtn.className = `btn ${_st.playingAll ? 'btn-secondary' : 'btn-primary'}`;
            }
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
                        <span style="font-size:.72rem;color:var(--text-muted);flex-shrink:0;">${esc(keyLabel)} · ${s.bpm || 80} BPM</span>
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
            _st.savingTitle = study.title || '';
            // Handle both v2 format (slots: string[][]) and v3 (slots: string[])
            const raw = study.slots;
            if (Array.isArray(raw)) {
                _st.melodies = raw.map(item => {
                    if (typeof item === 'string') return item;         // v3
                    if (Array.isArray(item)) return item.filter(Boolean).join(' '); // v2 compat
                    return '';
                });
            } else {
                _st.melodies = [];
            }
            _parseHarmony();
            _ensureMelodies(); // re-sync chordDefaults to new chord count
            _st.tab = 'editor';
            C.render();
            window.HMSApp.showToast(`"${study.title}" carregado.`, 'success');
        },

        _saveStudy: async function () {
            const title = (_st.savingTitle || '').trim();
            if (!title)                 { window.HMSApp.showToast('Informe um título.', 'warning'); return; }
            if (!_st.harmonyStr.trim()) { window.HMSApp.showToast('Harmonia vazia.', 'warning');   return; }
            _ensureMelodies();
            try {
                await window.HMSAPI.HarmonicStudies.create({
                    title,
                    root:     _st.root,
                    is_minor: _st.isMinor,
                    harmony:  _st.harmonyStr,
                    bpm:      _st.bpm,
                    note_dur: '8n',          // kept for schema compat
                    slots:    _st.melodies,  // string[] (v3 format)
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
    console.info('[HMS] HarmonicMelodicComponent v3.2 loaded.');
})();
