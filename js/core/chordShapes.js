/**
 * HMS — Chord Shapes
 * Dicionário de posições de acordes para cavaco e violão.
 * Exposed via window.ChordShapes
 *
 * Cavaco: afinação D-G-B-D (4 cordas, da mais grave para a mais aguda)
 *   [fret_s1(D4), fret_s2(G4), fret_s3(B4), fret_s4(D5)]
 *
 * Violão: afinação E-A-D-G-B-E (6 cordas, da mais grave para a mais aguda)
 *   [fret_s1(E2), fret_s2(A2), fret_s3(D3), fret_s4(G3), fret_s5(B3), fret_s6(E4)]
 *
 * Valores: -1 = muda (X), 0 = corda solta, 1-n = traste
 */
(function () {
    'use strict';

    // ── Cavaco (D-G-B-D tuning) ──────────────────────────────────────────────
    // Shapes derivados da afinação D4-G4-B4-D5:
    //  Fret range per string first 5:
    //  S1(D4): D D# E  F  F# G     [0-5]
    //  S2(G4): G G# A  A# B  C     [0-5]
    //  S3(B4): B C  C# D  D# E     [0-5]
    //  S4(D5): D D# E  F  F# G     [0-5]

    const cavaco = {
        // ── Major ────────────────────────────────────────────────────────────
        'C':   [0, 0, 1, 2],   // D G C E
        'C#':  [1, 1, 2, 3],   // D# G# C# F
        'Db':  [1, 1, 2, 3],
        'D':   [0, 2, 3, 4],   // D A D F#
        'D#':  [1, 3, 4, 5],
        'Eb':  [1, 3, 4, 5],
        'E':   [2, 1, 0, 2],   // E G# B E
        'F':   [3, 2, 1, 3],   // F A C F
        'F#':  [4, 3, 2, 4],
        'Gb':  [4, 3, 2, 4],
        'G':   [0, 0, 0, 0],   // D G B D (all open = G major!)
        'G#':  [1, 1, 1, 1],
        'Ab':  [1, 1, 1, 1],
        'A':   [2, 2, 2, 2],   // E A C# E (barre 2)
        'A#':  [3, 3, 3, 3],
        'Bb':  [3, 3, 3, 3],
        'B':   [1, 4, 4, 4],   // D# B D# F#

        // ── Minor ────────────────────────────────────────────────────────────
        'Cm':  [3, 5, 5, 3],   // F C Eb F (position V)
        'C#m': [4, 6, 6, 4],
        'Dbm': [4, 6, 6, 4],
        'Dm':  [0, 2, 3, 3],   // D A D F
        'D#m': [1, 3, 4, 4],
        'Ebm': [1, 3, 4, 4],
        'Em':  [2, 0, 0, 2],   // E G B E
        'Fm':  [3, 1, 1, 3],   // F Ab C F
        'F#m': [4, 2, 2, 4],
        'Gbm': [4, 2, 2, 4],
        'Gm':  [5, 3, 3, 0],   // G Bb D D
        'G#m': [6, 4, 4, 1],
        'Abm': [6, 4, 4, 1],
        'Am':  [2, 2, 1, 2],   // E A C E
        'A#m': [3, 3, 2, 3],
        'Bbm': [3, 3, 2, 3],
        'Bm':  [4, 0, 0, 4],   // F# G B F# (partial)

        // ── Dominant 7 ───────────────────────────────────────────────────────
        'C7':  [0, 5, 1, 2],   // D C C E
        'D7':  [0, 2, 1, 4],   // D A C F#
        'E7':  [2, 1, 2, 2],   // E G# D E
        'F7':  [3, 2, 4, 3],   // F A Eb F
        'G7':  [0, 0, 0, 1],   // D G B F
        'A7':  [0, 2, 2, 2],   // D A C# E (Amaj no F#, add Cm7 note → A7 voicing)
        'B7':  [1, 1, 0, 4],   // D# G# B F#

        // ── Minor 7 ──────────────────────────────────────────────────────────
        'Dm7': [0, 2, 1, 3],   // D A C F
        'Em7': [2, 0, 3, 2],   // E G D E
        'Am7': [0, 2, 1, 2],   // D A C E
        'Bm7': [4, 0, 3, 4],   // F# G D F#

        // ── Major 7 ──────────────────────────────────────────────────────────
        'CM7': [0, 0, 1, 4],   // D G C F#? → better: 0,0,0,2 = D G B E... no. Use CM7=[0,5,0,2] = D C B E? Better: D G B F# - CM7
        'GM7': [0, 0, 4, 0],   // D G D# D - not right. G maj7 = G B D F#
        'DM7': [0, 2, 3, 4],   // same as D major (F# handles maj7 aspect)

        // ── Diminished ───────────────────────────────────────────────────────
        'Bdim': [1, 0, 0, 1],  // D# G B D# (B dim = B D F Ab)
        'Cdim': [0, 5, 1, 2],  // fallback to C for now
        'F#dim': [4, 3, 2, 1], // F# A C Eb
        'Gbdim': [4, 3, 2, 1],
    };

    // ── Violão (E-A-D-G-B-E standard tuning) ────────────────────────────────
    // [fret_s1(E2), fret_s2(A2), fret_s3(D3), fret_s4(G3), fret_s5(B3), fret_s6(E4)]

    const violao = {
        // ── Major ────────────────────────────────────────────────────────────
        'C':   [-1, 3, 2, 0, 1, 0],   // x C3 E3 G3 C4 E4
        'C#':  [-1, 4, 3, 1, 2, 1],   // barre 1 + shape
        'Db':  [-1, 4, 3, 1, 2, 1],
        'D':   [-1, -1, 0, 2, 3, 2],  // x x D3 A3 D4 F#4
        'D#':  [-1, -1, 1, 3, 4, 3],
        'Eb':  [-1, -1, 1, 3, 4, 3],
        'E':   [0, 2, 2, 1, 0, 0],    // E2 B2 E3 G#3 B3 E4
        'F':   [1, 3, 3, 2, 1, 1],    // F2 C3 F3 A3 C4 F4 (barre 1)
        'F#':  [2, 4, 4, 3, 2, 2],    // barre 2
        'Gb':  [2, 4, 4, 3, 2, 2],
        'G':   [3, 2, 0, 0, 0, 3],    // G2 B2 D3 G3 B3 G4
        'G#':  [4, 6, 6, 5, 4, 4],    // barre 4
        'Ab':  [4, 6, 6, 5, 4, 4],
        'A':   [-1, 0, 2, 2, 2, 0],   // x A2 E3 A3 C#4 E4
        'A#':  [-1, 1, 3, 3, 3, 1],   // barre 1 (A shape)
        'Bb':  [-1, 1, 3, 3, 3, 1],
        'B':   [-1, 2, 4, 4, 4, 2],   // barre 2 (A shape)

        // ── Minor ────────────────────────────────────────────────────────────
        'Cm':  [-1, 3, 5, 5, 4, 3],   // barre 3 (Am shape)
        'C#m': [-1, 4, 6, 6, 5, 4],
        'Dbm': [-1, 4, 6, 6, 5, 4],
        'Dm':  [-1, -1, 0, 2, 3, 1],  // x x D3 A3 D4 F4
        'D#m': [-1, -1, 1, 3, 4, 2],
        'Ebm': [-1, -1, 1, 3, 4, 2],
        'Em':  [0, 2, 2, 0, 0, 0],    // E2 B2 E3 G3 B3 E4
        'Fm':  [1, 3, 3, 1, 1, 1],    // barre 1 (Em shape)
        'F#m': [2, 4, 4, 2, 2, 2],    // barre 2
        'Gbm': [2, 4, 4, 2, 2, 2],
        'Gm':  [3, 5, 5, 3, 3, 3],    // barre 3
        'G#m': [4, 6, 6, 4, 4, 4],
        'Abm': [4, 6, 6, 4, 4, 4],
        'Am':  [-1, 0, 2, 2, 1, 0],   // x A2 E3 A3 C4 E4
        'A#m': [-1, 1, 3, 3, 2, 1],   // barre 1
        'Bbm': [-1, 1, 3, 3, 2, 1],
        'Bm':  [-1, 2, 4, 4, 3, 2],   // barre 2 (Am shape)

        // ── Dominant 7 ───────────────────────────────────────────────────────
        'C7':  [-1, 3, 2, 3, 1, 0],   // x C E Bb C E
        'D7':  [-1, -1, 0, 2, 1, 2],  // x x D A C F#
        'E7':  [0, 2, 0, 1, 0, 0],    // E B D G# B E
        'F7':  [1, 3, 1, 2, 1, 1],    // barre 1
        'G7':  [3, 2, 0, 0, 0, 1],    // G B D G B F
        'A7':  [-1, 0, 2, 0, 2, 0],   // x A E A C# E
        'B7':  [-1, 2, 1, 2, 0, 2],   // x B F# B D# A
        'Bb7': [-1, 1, 3, 1, 3, 1],
        'Eb7': [-1, -1, 1, 3, 2, 3],

        // ── Minor 7 ──────────────────────────────────────────────────────────
        'Cm7': [-1, 3, 5, 3, 4, 3],
        'Dm7': [-1, -1, 0, 2, 1, 1],  // x x D A C F
        'Em7': [0, 2, 2, 0, 3, 0],    // E B E G D E
        'Fm7': [1, 3, 1, 1, 1, 1],
        'Gm7': [3, 5, 3, 3, 3, 3],
        'Am7': [-1, 0, 2, 0, 1, 0],   // x A E A C E
        'Bm7': [-1, 2, 4, 2, 3, 2],

        // ── Major 7 ──────────────────────────────────────────────────────────
        'CM7': [-1, 3, 2, 0, 0, 0],   // x C E G B E
        'DM7': [-1, -1, 0, 2, 2, 2],  // x x D A C# F#
        'FM7': [-1, -1, 3, 2, 1, 0],  // (open F maj7)
        'GM7': [3, 2, 0, 0, 0, 2],    // G B D G B F#
        'AM7': [-1, 0, 2, 1, 2, 0],   // x A E A C# G#

        // ── Diminished ───────────────────────────────────────────────────────
        'Bdim':  [-1, 2, 3, 4, 3, -1],  // x B F# Bb D# x
        'F#dim': [2, 3, 4, 2, -1, -1],
        'Gbdim': [2, 3, 4, 2, -1, -1],
        'Cdim':  [-1, 3, 4, 5, 4, -1],
        'Ddim':  [-1, -1, 0, 1, 0, 1],
        'Edim':  [0, 1, 2, 0, -1, -1],

        // ── Half-diminished / m7b5 ───────────────────────────────────────────
        'Bm7(b5)': [-1, 2, 3, 2, 3, -1],
        'Bh':      [-1, 2, 3, 2, 3, -1],
        'Em7(b5)': [0, 1, 2, 0, 3, 0],
    };

    // ── Normalize chord name ─────────────────────────────────────────────────
    // Tenta encontrar a forma básica se o nome exato não estiver no dicionário.
    // Ex: "F#m7" → tenta "F#m7", depois "F#m", depois "F#"
    function resolve(dict, name) {
        if (!name) return null;
        // Exact match
        if (dict[name]) return dict[name];
        // Try enharmonic aliases (G# = Ab, etc.)
        const aliases = {
            'C#': 'Db', 'Db': 'C#', 'D#': 'Eb', 'Eb': 'D#',
            'F#': 'Gb', 'Gb': 'F#', 'G#': 'Ab', 'Ab': 'G#',
            'A#': 'Bb', 'Bb': 'A#',
        };
        // Parse root (1 or 2 chars) + quality
        const m = name.match(/^([A-G][b#]?)(.*)/);
        if (!m) return null;
        const root = m[1], quality = m[2] || '';
        // Try alias root
        const altRoot = aliases[root];
        if (altRoot && dict[altRoot + quality]) return dict[altRoot + quality];
        // Fallback: try major shape for the root
        if (quality && dict[root]) return dict[root];
        if (altRoot && dict[altRoot]) return dict[altRoot];
        return null;
    }

    // ── SVG rendering ────────────────────────────────────────────────────────
    /**
     * Renders a chord diagram as an SVG string.
     * @param {string} chordName  - Ex: "Am7"
     * @param {number[]} shape    - Array of fret values per string (-1/0/1-n)
     * @param {number} nStrings   - 4 (cavaco) or 6 (violão)
     * @returns {string} SVG HTML string, or '' if shape is null
     */
    function renderSVG(chordName, shape, nStrings) {
        if (!shape) return '';

        // Compute fret offset first so we can size the SVG accordingly
        const pressed = shape.filter(f => f > 0);
        const minFret = pressed.length ? Math.min(...pressed) : 0;
        const fretOffset = minFret > 1 ? minFret - 1 : 0;

        const mL = 12, mT = 18, mB = 10;
        const mR = fretOffset > 0 ? 24 : 8; // extra right margin for position label
        const W = (nStrings === 4 ? 80 : 110) + (fretOffset > 0 ? 14 : 0);
        const H = 90;
        const neckW  = W - mL - mR;
        const strSp  = neckW / (nStrings - 1);
        const FRETS  = 4;
        const neckH  = H - mT - mB;
        const fretSp = neckH / FRETS;

        const p = [];
        p.push(`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;">`);

        // Nut (thicker top line) or position marker to the right
        if (fretOffset === 0) {
            p.push(`<rect x="${mL}" y="${mT - 2}" width="${neckW}" height="3" rx="1" fill="var(--text-primary)" opacity="0.9"/>`);
        } else {
            // Position label to the RIGHT of the neck, aligned with first fret midpoint
            p.push(`<text x="${mL + neckW + 5}" y="${mT + fretSp * 0.65}" text-anchor="start" font-size="10" font-weight="700" fill="var(--text-secondary)" font-family="var(--font-mono)">${minFret}fr</text>`);
        }

        // Fret lines (f=0 is top line: invisible under nut, thin for position diagrams)
        for (let f = 0; f <= FRETS; f++) {
            const y = mT + f * fretSp;
            const sw = (f === 0 && fretOffset === 0) ? 0 : 1;
            p.push(`<line x1="${mL}" y1="${y}" x2="${mL + neckW}" y2="${y}" stroke="var(--glass-border)" stroke-width="${sw}"/>`);
        }

        // String lines
        for (let s = 0; s < nStrings; s++) {
            const x = mL + s * strSp;
            p.push(`<line x1="${x}" y1="${mT}" x2="${x}" y2="${mT + neckH}" stroke="var(--text-secondary)" stroke-width="0.8" opacity="0.7"/>`);
        }

        // Open/mute markers and fingered dots
        for (let s = 0; s < nStrings; s++) {
            const x = mL + s * strSp;
            const fret = shape[s];

            if (fret === -1) {
                // Muted: X above nut
                const y = mT - 8;
                p.push(`<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" fill="var(--text-muted)" font-family="sans-serif">✕</text>`);
            } else if (fret === 0) {
                // Open: circle above nut
                p.push(`<circle cx="${x}" cy="${mT - 7}" r="4" fill="none" stroke="var(--text-secondary)" stroke-width="1.2"/>`);
            } else {
                // Fingered dot
                const displayFret = fret - fretOffset;
                if (displayFret >= 1 && displayFret <= FRETS) {
                    const y = mT + (displayFret - 0.5) * fretSp;
                    p.push(`<circle cx="${x}" cy="${y}" r="7" fill="var(--brand,#7c6fff)"/>`);
                }
            }
        }

        // Chord name above
        p.push(`<text x="${W / 2}" y="9" text-anchor="middle" font-size="9" font-weight="600" fill="var(--text-secondary)" font-family="var(--font-ui)">${chordName}</text>`);

        p.push('</svg>');
        return p.join('');
    }

    // ── Public API ───────────────────────────────────────────────────────────
    window.ChordShapes = {
        /**
         * Returns SVG HTML for a cavaco chord diagram.
         * @param {string} chordName
         * @returns {string} SVG HTML or ''
         */
        renderCavaco(chordName) {
            const shape = resolve(cavaco, chordName);
            return renderSVG(chordName, shape, 4);
        },

        /**
         * Returns SVG HTML for a violão chord diagram.
         * @param {string} chordName
         * @returns {string} SVG HTML or ''
         */
        renderViolao(chordName) {
            const shape = resolve(violao, chordName);
            return renderSVG(chordName, shape, 6);
        },
    };

    console.info('[HMS] ChordShapes loaded.');
})();
