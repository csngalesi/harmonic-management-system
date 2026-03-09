/**
 * HMS — Harmony Engine
 * Core parser and transposer for functional harmony degrees.
 * Implements the full HMS state-machine grammar.
 *
 * Public API (window.HarmonyEngine):
 *   .translate(harmonyStr, rootName, isMinor) → ResultToken[]
 *   .analyze(chordsStr, rootName, isMinor)    → string (degree string)
 *   .allKeys()                                → Array of { value, label }
 */
(function () {
    'use strict';

    // ── Chromatic Constants ──────────────────────────────────────
    const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Keys that should render notes with flat spellings
    const FLAT_PREF = new Set([
        'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb',
        'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm',
    ]);

    // Convert note name (e.g. "Bb", "F#", "C") to chromatic index 0-11
    function noteToIdx(name) {
        const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        const letter = name[0].toUpperCase();
        let idx = BASE[letter] ?? 0;
        for (let i = 1; i < name.length; i++) {
            if (name[i] === '#') idx++;
            else if (name[i] === 'b') idx--;
        }
        return ((idx % 12) + 12) % 12;
    }

    function idxToNote(idx, useFlats) {
        idx = ((idx % 12) + 12) % 12;
        return useFlats ? FLAT_NAMES[idx] : SHARP_NAMES[idx];
    }

    // ── Scale Intervals (semitones from root) ────────────────────
    const MAJOR_SCALE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
    const MINOR_SCALE = { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 10 };

    // Diatonic quality for a bare degree in each mode
    const MAJOR_QUALITY = { 1: '', 2: 'm', 3: 'm', 4: '', 5: '7', 6: 'm', 7: 'm7(b5)' };
    const MINOR_QUALITY = { 1: 'm', 2: 'm7(b5)', 3: '', 4: 'm', 5: '7', 6: '', 7: '' };

    // ── Key State ────────────────────────────────────────────────
    function makeKeyState(rootName, isMinor) {
        const key = rootName + (isMinor ? 'm' : '');
        return {
            rootIdx: noteToIdx(rootName),
            isMinor: !!isMinor,
            useFlats: FLAT_PREF.has(key) || FLAT_PREF.has(rootName),
        };
    }

    function degreeNoteIdx(keyState, degNum, accidental) {
        const scale = keyState.isMinor ? MINOR_SCALE : MAJOR_SCALE;
        let semitones = scale[degNum] ?? 0;
        if (accidental === 'b') semitones--;
        if (accidental === '#') semitones++;
        return ((keyState.rootIdx + semitones) % 12 + 12) % 12;
    }

    // Is degree X naturally minor in this key context?
    function isMinorDegree(keyState, degNum) {
        if (keyState.isMinor) return [1, 2, 4].includes(degNum);
        return [2, 3, 6].includes(degNum);
    }

    // ── Single Degree Token → Chord String ──────────────────────
    //   Input: "2m", "b3M7", "5", "7h", "6m7", "4", "1"
    //   Returns: "Am", "E7", "C", "Bm7(b5)", ...
    function renderDegreeToken(token, keyState) {
        const m = token.match(/^([b#]?)([1-7])(.*)$/);
        if (!m) return token;

        const accidental = m[1];
        const degNum = parseInt(m[2]);
        let suffix = m[3];

        const noteIdx = degreeNoteIdx(keyState, degNum, accidental);
        const note = idxToNote(noteIdx, keyState.useFlats);

        if (suffix === '') {
            // Apply diatonic rules
            const dMap = keyState.isMinor ? MINOR_QUALITY : MAJOR_QUALITY;
            suffix = dMap[degNum] ?? '';
        } else {
            // Manual override suffixes (order matters)
            // h = half-diminished
            if (suffix.includes('h')) suffix = suffix.replace('h', 'm7(b5)');
            // o = diminished (standalone 'o', not inside 'm7b5')
            if (/(?<![a-zA-Z])o(?![a-zA-Z])/.test(suffix)) suffix = suffix.replace('o', '°');
            // M7 = major seventh (keep), standalone M = force major (remove)
            suffix = suffix.replace(/^M(?!7)/, '');
        }

        return note + suffix;
    }

    // ── Tokenizer ────────────────────────────────────────────────
    // Converts a raw harmony string into a flat array of token objects.
    function tokenize(harmonyStr) {
        // 1. Clean visual dash separators; pre-process before slash injection
        let str = harmonyStr
            .replace(/\s*-\s*/g, ' ')
            .trim();

        // Pre-process SEC_DOM patterns that contain slashes (e.g. 5/(3/)) BEFORE
        // the global slash injection, which would otherwise break them.
        const secDomSlash = [];
        str = str.replace(
            /([b#1-7mMho7]+)(\/?)(\(([^)]*)\)|"([^"]*)")/g,
            (match, prefix, slashPre, _tFull, targetP, targetQ) => {
                const rawTarget = targetP !== undefined ? targetP : (targetQ || '');
                const slashBeforeTarget = slashPre === '/';
                const slashAfterTarget = rawTarget.endsWith('/');
                if (!slashBeforeTarget && !slashAfterTarget) return match;
                const showTarget = _tFull[0] === '(';
                const cleanTarget = rawTarget.replace(/\/$/, '');
                const i = secDomSlash.length;
                secDomSlash.push({
                    type: 'SEC_DOM',
                    prefix: parsePrefixStr(prefix),
                    target: cleanTarget,
                    showTarget,
                    slashBeforeTarget,
                    slashAfterTarget,
                });
                return `¶${i}¶`;
            }
        );

        str = str.replace(/\//g, ' / '); // Ensure slashes are distinct structural tokens

        // 2a. Normalize [...]Nx repeat notation → {…}xN (spreadsheet alias)
        str = str.replace(/\[([^\]]*)\](\d+)x/gi, (_, content, n) => `{${content.trim()}}x${n}`);

        // 2. Extract {section}xN blocks (may contain spaces inside)
        const sections = [];
        str = str.replace(/\{([^}]*)\}x(\d+)/g, (_, content, n) => {
            const i = sections.length;
            sections.push({ content: content.trim(), times: parseInt(n, 10) });
            return `§${i}§`;
        });

        // 3. Split by whitespace
        const rawTokens = str.split(/\s+/).filter(Boolean);

        const tokens = [];
        for (const raw of rawTokens) {
            // SEC_DOM-with-slash placeholder
            const sdsM = raw.match(/^¶(\d+)¶$/);
            if (sdsM) {
                tokens.push(secDomSlash[parseInt(sdsM[1], 10)]);
                continue;
            }

            // Section placeholder
            const secM = raw.match(/^§(\d+)§$/);
            if (secM) {
                const s = sections[parseInt(secM[1], 10)];
                tokens.push({ type: 'SECTION', content: s.content, times: s.times });
                continue;
            }

            // Modulation tag: !...!
            if (raw.startsWith('!') && raw.endsWith('!') && raw.length > 2) {
                tokens.push({ type: 'MOD', value: raw.slice(1, -1) });
                continue;
            }

            // Structural tags
            if (raw === '/') { tokens.push({ type: 'STRUCT', value: '/' }); continue; }
            if (raw === '[') { tokens.push({ type: 'STRUCT', value: '[' }); continue; }
            if (raw === ']') { tokens.push({ type: 'STRUCT', value: ']' }); continue; }
            if (raw === '[1.') { tokens.push({ type: 'STRUCT', value: '[1.' }); continue; }
            if (raw === '[2.') { tokens.push({ type: 'STRUCT', value: '[2.' }); continue; }

            // 5.5 = V of V (dominant of the dominant).
            // E.g.: in C major → V of G → D7
            if (raw === '5.5') {
                tokens.push({ type: 'DOT_DEGREE', outer: '5', inner: '5' });
                continue;
            }

            // Secondary dominant: prefix + (target) or "target"
            // E.g.: 25(4), 57(6m), b725"4", 25(6m)
            const sdM = raw.match(/^([b#1-7mMho7]+)\((.+?)\)$/) ||
                raw.match(/^([b#1-7mMho7]+)"(.+?)"$/);
            if (sdM) {
                const showTarget = raw.includes('(');
                const prefixTokens = parsePrefixStr(sdM[1]);
                tokens.push({
                    type: 'SEC_DOM',
                    prefix: prefixTokens,
                    target: sdM[2],
                    showTarget,
                });
                continue;
            }

            // Repeat annotation like "2x", "3x" — pass through as raw text
            if (/^\d+x$/i.test(raw)) {
                tokens.push({ type: 'RAW', value: raw });
                continue;
            }

            // Reference label: $Texto$ — free-form annotation
            if (raw.startsWith('$') && raw.endsWith('$') && raw.length > 2) {
                tokens.push({ type: 'LABEL', value: raw.slice(1, -1) });
                continue;
            }

            // Regular chord degree(s).
            // A run like "251" (no spaces) must be split into ["2","5","1"].
            // Guard: only split when parsePrefixStr reconstructs the exact raw
            // string — otherwise a token like "1sus4" (foreign chars) is kept whole.
            if (/^[b#]?[1-7]/.test(raw)) {
                const parts = parsePrefixStr(raw);
                if (parts.length > 1 && parts.join('') === raw) {
                    for (const p of parts) tokens.push({ type: 'CHORD', value: p });
                } else {
                    tokens.push({ type: 'CHORD', value: raw });
                }
                continue;
            }

            // Unknown — pass through as raw text
            tokens.push({ type: 'RAW', value: raw });
        }

        return tokens;
    }

    // Parse a run of degree tokens from a string like "25" or "b725"
    function parsePrefixStr(str) {
        return str.match(/[b#]?[1-7][mMho7]*/g) || [];
    }

    // ── State Machine Processor ──────────────────────────────────
    // Returns: Array of ResultToken { type: 'CHORD'|'STRUCT', value: string }
    function processTokens(tokens, keyState) {
        const result = [];

        for (const token of tokens) {

            if (token.type === 'MOD') {
                applyModulation(token.value, keyState);

            } else if (token.type === 'STRUCT') {
                result.push({ type: 'STRUCT', value: token.value });

            } else if (token.type === 'CHORD') {
                result.push({ type: 'CHORD', value: renderDegreeToken(token.value, keyState) });

            } else if (token.type === 'SEC_DOM') {
                // Resolve target degree to a note and mode
                const tM = token.target.match(/^([b#]?)([1-7])([mM]?)(.*)$/);
                if (tM) {
                    const tAcc = tM[1];
                    const tDeg = parseInt(tM[2]);
                    const tMode = tM[3]; // '' | 'm' | 'M'

                    const tNoteIdx = degreeNoteIdx(keyState, tDeg, tAcc);
                    let tIsMinor;
                    if (tMode === 'm') tIsMinor = true;
                    else if (tMode === 'M') tIsMinor = false;
                    else tIsMinor = isMinorDegree(keyState, tDeg);

                    const targetKey = {
                        rootIdx: tNoteIdx,
                        isMinor: tIsMinor,
                        useFlats: keyState.useFlats,
                    };

                    // Render each prefix chord relative to the TARGET key
                    for (const pd of token.prefix) {
                        result.push({ type: 'CHORD', value: renderDegreeToken(pd, targetKey) });
                    }

                    // Optional slash between prefix chord(s) and target chord
                    if (token.slashBeforeTarget) {
                        result.push({ type: 'STRUCT', value: '/' });
                    }

                    // Show target chord if parens notation
                    if (token.showTarget) {
                        result.push({ type: 'CHORD', value: renderDegreeToken(token.target, keyState) });
                    }

                    // Optional slash after target chord
                    if (token.slashAfterTarget) {
                        result.push({ type: 'STRUCT', value: '/' });
                    }
                }

            } else if (token.type === 'DOT_DEGREE') {
                // X.Y — render inner degree Y in the temporary key rooted at outer degree X
                const outerM = token.outer.match(/^([b#]?)([1-7])$/);
                if (outerM) {
                    const outerIdx = degreeNoteIdx(keyState, parseInt(outerM[2]), outerM[1]);
                    const outerKey = {
                        rootIdx: outerIdx,
                        isMinor: isMinorDegree(keyState, parseInt(outerM[2])),
                        useFlats: keyState.useFlats,
                    };
                    result.push({ type: 'CHORD', value: renderDegreeToken(token.inner, outerKey) });
                }

            } else if (token.type === 'SECTION') {
                // Render section content once; append ×N marker when N > 1.
                // Expanding N times was wrong for display — musicians write {A}x2 meaning
                // "play section A twice", not "show all chords twice".
                const innerTokens = tokenize(token.content);
                const innerResults = processTokens(innerTokens, { ...keyState });
                result.push(...innerResults);
                if (token.times > 1) {
                    result.push({ type: 'STRUCT', value: '×' + token.times });
                }

            } else if (token.type === 'LABEL') {
                result.push({ type: 'LABEL', value: token.value });

            } else if (token.type === 'RAW') {
                result.push({ type: 'STRUCT', value: token.value });
            }
        }

        return result;
    }

    // Apply a modulation instruction to the keyState in-place
    function applyModulation(modStr, keyState) {
        if (modStr === 'm') { keyState.isMinor = true; return; }
        if (modStr === 'M') { keyState.isMinor = false; return; }

        // Full modulation: [b#]?[1-7][mM]
        const m = modStr.match(/^([b#]?)([1-7])([mM])$/);
        if (m) {
            const newRootIdx = degreeNoteIdx(keyState, parseInt(m[2]), m[1]);
            keyState.rootIdx = newRootIdx;
            keyState.isMinor = (m[3] === 'm');
        }
    }

    // ── Analyzer: Chords → Degrees ───────────────────────────────

    // Parse a chord string: "Bm7(b5)" → { root: "B", quality: "m7(b5)" }
    function parseChordStr(chordStr) {
        const m = chordStr.match(/^([A-G][b#]?)(.*)/);
        if (!m) return null;
        return { root: m[1], quality: m[2] };
    }

    function normalizeQ(q) {
        return q.replace(/\s/g, '').toLowerCase()
            .replace('maj7', 'M7').replace('maj', '')
            .replace('min7', 'm7').replace('min', 'm')
            .replace('dim7', '°7').replace('dim', '°')
            .replace('ø7', 'm7(b5)').replace('ø', 'm7(b5)')
            .replace('half-dim', 'm7(b5)');
    }

    // Convert a chord quality back to HMS suffix notation
    function qualityToHmsSuffix(quality) {
        const q = normalizeQ(quality);
        if (q === '' || q === 'M' || q === 'maj') return 'M'; // force major
        if (q === 'm') return 'm';
        if (q === '7') return '7';
        if (q === 'm7') return 'm7';
        if (q === 'M7') return 'M7';
        if (q === 'm7(b5)') return 'h';
        if (q === '°' || q === 'dim') return 'o';
        // Pass through unknown extensions
        return quality;
    }

    // Analyze a single chord string against a key, return degree token
    function analyzeChord(chordStr, keyState) {
        const parsed = parseChordStr(chordStr);
        if (!parsed) return chordStr;

        const chordRootIdx = noteToIdx(parsed.root);
        const scale = keyState.isMinor ? MINOR_SCALE : MAJOR_SCALE;
        const diatonic = keyState.isMinor ? MINOR_QUALITY : MAJOR_QUALITY;

        // Find matching diatonic degree
        for (let deg = 1; deg <= 7; deg++) {
            const scaleNoteIdx = ((keyState.rootIdx + scale[deg]) % 12 + 12) % 12;
            if (scaleNoteIdx !== chordRootIdx) continue;

            const dQ = diatonic[deg] ?? '';
            const chordQ = normalizeQ(parsed.quality);
            const diatoQ = normalizeQ(dQ);

            let degStr = String(deg);

            if (chordQ === diatoQ) {
                // Exactly diatonic — bare degree number
                return degStr;
            }

            // Non-diatonic quality override
            const hmsSuffix = qualityToHmsSuffix(parsed.quality);
            // If we're forcing a major chord on a naturally minor degree, use 'M'
            if (hmsSuffix === 'M' && ['2', '3', '6'].includes(degStr)) return degStr + 'M';
            return degStr + hmsSuffix;
        }

        // Chromatic (root not in scale) — find with accidental
        for (let deg = 1; deg <= 7; deg++) {
            const scaleNoteIdx = ((keyState.rootIdx + scale[deg]) % 12 + 12) % 12;
            if ((scaleNoteIdx + 1) % 12 === chordRootIdx) {
                return '#' + deg + qualityToHmsSuffix(parsed.quality);
            }
            if (((scaleNoteIdx - 1 + 12) % 12) === chordRootIdx) {
                return 'b' + deg + qualityToHmsSuffix(parsed.quality);
            }
        }

        return chordStr; // fallback
    }

    // Pattern recognition: detect ii-V-I, ii-V, secondary dominants.
    // repeatFlags[i] = true when position i had an adjacent duplicate chord in the input.
    function detectCadencePatterns(degreeArr, noteIdxArr, keyState, repeatFlags) {
        const scale    = keyState.isMinor ? MINOR_SCALE    : MAJOR_SCALE;
        const diatonic = keyState.isMinor ? MINOR_QUALITY  : MAJOR_QUALITY;
        const rf       = repeatFlags || [];

        const naturalVIdx = ((keyState.rootIdx + scale[5]) % 12 + 12) % 12;

        // Quality of a degree string: explicit if present, else infer from diatonic
        function getQ(degStr) {
            const explicit = extractQuality(degStr);
            if (explicit !== '') return normalizeQ(explicit);
            const m = degStr.match(/^[b#]?([1-7])$/);
            if (m) return normalizeQ(diatonic[parseInt(m[1])] ?? '');
            return '';
        }

        // Degree number (1-7) for a note index in this key, or null
        function degForNote(ni) {
            for (let d = 1; d <= 7; d++) {
                if (((keyState.rootIdx + scale[d]) % 12 + 12) % 12 === ni) return d;
            }
            return null;
        }

        // Build a SEC_DOM token string.
        // prefix: HMS prefix like "25" or "5"
        // target: bare target degree like "4" or "1m"
        // slashBefore: insert "/" between prefix output and target (repeats prefix's last chord)
        // slashAfter:  insert "/" after target (repeats target chord)
        // show: true → parens (show target), false → double quotes (hide target)
        function mkSecDom(prefix, target, slashBefore, slashAfter, show) {
            const open  = show ? '(' : '"';
            const close = show ? ')' : '"';
            return `${prefix}${slashBefore ? '/' : ''}${open}${target}${slashAfter ? '/' : ''}${close}`;
        }

        // Bare target string: degree number + mode ("4", "1m", etc.)
        function tgt(d) { return extractBareNumber(d) + extractMode(d); }

        const result = [];
        let i = 0;

        while (i < degreeArr.length) {
            if (i + 1 < degreeArr.length) {
                const ni1 = noteIdxArr[i], ni2 = noteIdxArr[i + 1];
                const d1  = degreeArr[i],  d2  = degreeArr[i + 1];
                const q1  = getQ(d1),      q2  = getQ(d2);
                const r0  = rf[i]     ?? false;
                const r1  = rf[i + 1] ?? false;

                const isIIchord = (q1 === 'm' || q1 === 'm7' || q1 === 'h');
                const isP4up    = ((ni1 + 5) % 12 === ni2);

                // ii-V detection (V must have dominant 7 quality)
                if (isIIchord && q2 === '7' && isP4up) {
                    const targetIdx = (ni2 + 5) % 12; // V resolves P4 above its root

                    if (i + 2 < degreeArr.length && noteIdxArr[i + 2] === targetIdx) {
                        // ii-V-I: consume 3 chords
                        const r2 = rf[i + 2] ?? false;
                        const t  = tgt(degreeArr[i + 2]);
                        if (r0) {
                            // ii has its own repeat; V→I as a separate SEC_DOM
                            result.push('2'); result.push('/');
                            result.push(mkSecDom('5', t, r1, r2, true));
                        } else {
                            result.push(mkSecDom('25', t, r1, r2, true));
                        }
                        i += 3; continue;
                    } else {
                        // ii-V without immediate resolution → hidden target
                        const tDegNum = degForNote(targetIdx);
                        const t = tDegNum ? String(tDegNum) : '?';
                        if (r0) {
                            result.push('2'); result.push('/');
                            result.push(mkSecDom('5', t, r1, false, false));
                        } else {
                            result.push(mkSecDom('25', t, r1, false, false));
                        }
                        i += 2; continue;
                    }
                }

                // Secondary dominant: non-natural-V chord with dominant quality resolving P4 up
                if (q1 === '7' && ((ni1 + 5) % 12 === ni2) && ni1 !== naturalVIdx) {
                    result.push(mkSecDom('5', tgt(d2), r0, r1, true));
                    i += 2; continue;
                }
            }

            // Regular chord: output as-is; add "/" if it had a repeat in the input
            result.push(degreeArr[i]);
            if (rf[i] ?? false) result.push('/');
            i++;
        }
        return result;
    }

    function extractQuality(degStr) {
        const m = degStr.match(/^[b#]?[1-7](.*)/);
        return m ? m[1] : '';
    }

    function extractBareNumber(degStr) {
        const m = degStr.match(/[b#]?([1-7])/);
        return m ? m[1] : degStr;
    }

    function extractMode(degStr) {
        const m = degStr.match(/[b#]?[1-7]([mM]?)/);
        return m ? m[1] : '';
    }

    // ── All Available Keys ───────────────────────────────────────
    function allKeys() {
        return [
            // Major
            { value: 'C', label: 'C Maior', isMinor: false },
            { value: 'G', label: 'G Maior', isMinor: false },
            { value: 'D', label: 'D Maior', isMinor: false },
            { value: 'A', label: 'A Maior', isMinor: false },
            { value: 'E', label: 'E Maior', isMinor: false },
            { value: 'B', label: 'B Maior', isMinor: false },
            { value: 'F#', label: 'F# Maior', isMinor: false },
            { value: 'F', label: 'F Maior', isMinor: false },
            { value: 'Bb', label: 'Bb Maior', isMinor: false },
            { value: 'Eb', label: 'Eb Maior', isMinor: false },
            { value: 'Ab', label: 'Ab Maior', isMinor: false },
            { value: 'Db', label: 'Db Maior', isMinor: false },
            { value: 'Gb', label: 'Gb Maior', isMinor: false },
            // Minor
            { value: 'Am', label: 'A Menor', isMinor: true },
            { value: 'Em', label: 'E Menor', isMinor: true },
            { value: 'Bm', label: 'B Menor', isMinor: true },
            { value: 'F#m', label: 'F# Menor', isMinor: true },
            { value: 'C#m', label: 'C# Menor', isMinor: true },
            { value: 'G#m', label: 'G# Menor', isMinor: true },
            { value: 'Dm', label: 'D Menor', isMinor: true },
            { value: 'Gm', label: 'G Menor', isMinor: true },
            { value: 'Cm', label: 'C Menor', isMinor: true },
            { value: 'Fm', label: 'F Menor', isMinor: true },
            { value: 'Bbm', label: 'Bb Menor', isMinor: true },
            { value: 'Ebm', label: 'Eb Menor', isMinor: true },
        ];
    }

    // ── Public API ───────────────────────────────────────────────
    window.HarmonyEngine = {

        /**
         * Translate harmony degree string to rendered chords.
         * @param {string}  harmonyStr - e.g. "1 - 6m - 25(4)"
         * @param {string}  rootName   - e.g. "C", "Bb", "Am"
         * @param {boolean} isMinor    - true if minor key
         * @returns {Array} ResultToken[] — { type: 'CHORD'|'STRUCT', value: string }
         */
        translate(harmonyStr, rootName, isMinor = false) {
            if (!harmonyStr || !rootName) return [];
            // Handle "Am" style rootName
            const actualRoot = rootName.replace(/m$/, '');
            const actualMinor = isMinor || rootName.endsWith('m');
            const keyState = makeKeyState(actualRoot, actualMinor);
            const tokens = tokenize(harmonyStr);
            return processTokens(tokens, keyState);
        },

        /**
         * Analyze chord string into HMS degree notation.
         * @param {string}  chordsStr - e.g. "C Am Bm7(b5) E7"
         * @param {string}  rootName  - e.g. "C"
         * @param {boolean} isMinor
         * @returns {string} degree string - e.g. "1 6m 7h 57"
         */
        analyze(chordsStr, rootName, isMinor = false) {
            if (!chordsStr || !rootName) return '';

            const actualRoot = rootName.replace(/m$/, '');
            const actualMinor = isMinor || rootName.endsWith('m');
            const keyState = makeKeyState(actualRoot, actualMinor);

            // Parse chord list (accepts space or dash separators)
            const allChords = chordsStr
                .replace(/\s*-\s*/g, ' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean);

            // Deduplicate adjacent identical chords; track which positions had a repeat
            const chords      = [];
            const noteIdxArr  = [];
            const repeatFlags = [];
            for (const c of allChords) {
                const parsed = parseChordStr(c);
                const ni = parsed ? noteToIdx(parsed.root) : -1;
                if (chords.length > 0 && c === chords[chords.length - 1] && ni === noteIdxArr[noteIdxArr.length - 1]) {
                    repeatFlags[repeatFlags.length - 1] = true; // mark previous as repeated
                } else {
                    chords.push(c);
                    noteIdxArr.push(ni);
                    repeatFlags.push(false);
                }
            }

            // Map chords to degree tokens
            const degreeArr = chords.map(c => analyzeChord(c, keyState));

            // Apply cadence pattern recognition
            const refined = detectCadencePatterns(degreeArr, noteIdxArr, keyState, repeatFlags);

            return refined.join(' ');
        },

        /**
         * Sanitize a harmony string: wraps unrecognized (RAW) tokens in $...$
         * so they become LABEL tokens on next parse.
         * @param {string} harmonyStr
         * @returns {string} sanitized string
         */
        sanitize(harmonyStr) {
            if (!harmonyStr || !harmonyStr.trim()) return harmonyStr;
            const tokens = tokenize(harmonyStr);
            const parts = [];
            for (const t of tokens) {
                switch (t.type) {
                    case 'CHORD':    parts.push(t.value); break;
                    case 'STRUCT':   parts.push(t.value); break;
                    case 'LABEL':    parts.push(`$${t.value}$`); break;
                    case 'MOD':      parts.push(`!${t.value}!`); break;
                    case 'RAW':
                        // Repeat markers (2x, 3x) are intentional — keep as-is
                        parts.push(/^\d+x$/i.test(t.value) ? t.value : `$${t.value}$`);
                        break;
                    case 'SEC_DOM': {
                        const prefix = t.prefix.join('');
                        const open   = t.showTarget ? '(' : '"';
                        const close  = t.showTarget ? ')' : '"';
                        const slashB = t.slashBeforeTarget ? '/' : '';
                        const slashA = t.slashAfterTarget  ? '/' : '';
                        parts.push(`${prefix}${slashB}${open}${t.target}${slashA}${close}`);
                        break;
                    }
                    case 'SECTION':    parts.push(`{${t.content}}x${t.times}`); break;
                    case 'DOT_DEGREE': parts.push(`${t.outer}.${t.inner}`); break;
                }
            }
            // Merge adjacent $...$ tokens: "$A$ $B$" → "$A B$"
            return parts.join(' ').replace(/\$([^$]*)\$(\s+\$([^$]*)\$)+/g, (match) => {
                const texts = match.match(/\$([^$]*)\$/g).map(s => s.slice(1, -1));
                return `$${texts.join(' ')}$`;
            });
        },

        allKeys,

        // For unit testing
        _noteToIdx: noteToIdx,
        _idxToNote: idxToNote,
        _renderDegreeToken: renderDegreeToken,
    };

    console.info('[HMS] HarmonyEngine loaded.');
})();
