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
    const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

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
            rootIdx:   noteToIdx(rootName),
            isMinor:   !!isMinor,
            useFlats:  FLAT_PREF.has(key) || FLAT_PREF.has(rootName),
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
        const degNum     = parseInt(m[2]);
        let   suffix     = m[3];

        const noteIdx = degreeNoteIdx(keyState, degNum, accidental);
        const note    = idxToNote(noteIdx, keyState.useFlats);

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
        // 1. Clean visual dash separators (space-dash-space)
        let str = harmonyStr
            .replace(/\s*-\s*/g, ' ')
            .trim();

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
            if (raw === '/')    { tokens.push({ type: 'STRUCT', value: '/' });   continue; }
            if (raw === '[')    { tokens.push({ type: 'STRUCT', value: '[' });   continue; }
            if (raw === ']')    { tokens.push({ type: 'STRUCT', value: ']' });   continue; }
            if (raw === '[1.')  { tokens.push({ type: 'STRUCT', value: '[1.' }); continue; }
            if (raw === '[2.')  { tokens.push({ type: 'STRUCT', value: '[2.' }); continue; }

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

            // Regular chord degree
            if (/^[b#]?[1-7]/.test(raw)) {
                tokens.push({ type: 'CHORD', value: raw });
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
                    const tAcc  = tM[1];
                    const tDeg  = parseInt(tM[2]);
                    const tMode = tM[3]; // '' | 'm' | 'M'

                    const tNoteIdx = degreeNoteIdx(keyState, tDeg, tAcc);
                    let   tIsMinor;
                    if (tMode === 'm')      tIsMinor = true;
                    else if (tMode === 'M') tIsMinor = false;
                    else                    tIsMinor = isMinorDegree(keyState, tDeg);

                    const targetKey = {
                        rootIdx:  tNoteIdx,
                        isMinor:  tIsMinor,
                        useFlats: keyState.useFlats,
                    };

                    // Render each prefix chord relative to the TARGET key
                    for (const pd of token.prefix) {
                        result.push({ type: 'CHORD', value: renderDegreeToken(pd, targetKey) });
                    }

                    // Show target chord if parens notation
                    if (token.showTarget) {
                        result.push({ type: 'CHORD', value: renderDegreeToken(token.target, keyState) });
                    }
                }

            } else if (token.type === 'SECTION') {
                // Expand {section}xN: process inner content N times
                const innerTokens = tokenize(token.content);
                for (let i = 0; i < token.times; i++) {
                    const innerResults = processTokens(innerTokens, { ...keyState });
                    result.push(...innerResults);
                }

            } else if (token.type === 'RAW') {
                result.push({ type: 'STRUCT', value: token.value });
            }
        }

        return result;
    }

    // Apply a modulation instruction to the keyState in-place
    function applyModulation(modStr, keyState) {
        if (modStr === 'm') { keyState.isMinor = true;  return; }
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
        if (q === 'm')          return 'm';
        if (q === '7')          return '7';
        if (q === 'm7')         return 'm7';
        if (q === 'M7')         return 'M7';
        if (q === 'm7(b5)')     return 'h';
        if (q === '°' || q === 'dim')  return 'o';
        // Pass through unknown extensions
        return quality;
    }

    // Analyze a single chord string against a key, return degree token
    function analyzeChord(chordStr, keyState) {
        const parsed = parseChordStr(chordStr);
        if (!parsed) return chordStr;

        const chordRootIdx = noteToIdx(parsed.root);
        const scale     = keyState.isMinor ? MINOR_SCALE : MAJOR_SCALE;
        const diatonic  = keyState.isMinor ? MINOR_QUALITY : MAJOR_QUALITY;

        // Find matching diatonic degree
        for (let deg = 1; deg <= 7; deg++) {
            const scaleNoteIdx = ((keyState.rootIdx + scale[deg]) % 12 + 12) % 12;
            if (scaleNoteIdx !== chordRootIdx) continue;

            const dQ     = diatonic[deg] ?? '';
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
            if (hmsSuffix === 'M' && ['2','3','6'].includes(degStr)) return degStr + 'M';
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

    // Pattern recognition: detect ii-V-I and compress to 25(target) notation
    function detectCadencePatterns(degreeArr, noteIdxArr) {
        const result = [];
        let i = 0;

        while (i < degreeArr.length) {
            // Look for ii-V pattern: chord[i] minor, chord[i+1] dominant 7th
            // where chord[i+1]'s root is a perfect 4th above chord[i]'s root
            if (i + 1 < degreeArr.length) {
                const ni1 = noteIdxArr[i];
                const ni2 = noteIdxArr[i + 1];
                const d1  = degreeArr[i];
                const d2  = degreeArr[i + 1];
                const q1  = extractQuality(d1);
                const q2  = extractQuality(d2);

                const isIIchord = (q1 === 'm' || q1 === 'm7' || q1 === 'h');
                const isVchord  = (q2 === '7' || q2 === '');
                // Root of V should be P4 above root of ii (= 5 semitones up)
                const isP4up = ((ni1 + 5) % 12 === ni2);

                if (isIIchord && isVchord && isP4up && q2 === '7') {
                    // Predict target: P5 above V = P4 below V = ni2 + 7 (or ni2 - 5)
                    const targetIdx = (ni2 + 7) % 12;

                    // Check if next chord is the target
                    if (i + 2 < degreeArr.length && noteIdxArr[i + 2] === targetIdx) {
                        const targetDeg = degreeArr[i + 2];
                        result.push(`25(${extractBareNumber(targetDeg)}${extractMode(targetDeg)})`);
                        i += 3; // consume ii-V-I
                        continue;
                    } else {
                        // ii-V without resolution → hidden target notation
                        const targetDeg = predictTargetDegree(degreeArr[i + 1], noteIdxArr[i + 1], degreeArr);
                        result.push(`25"${targetDeg}"`);
                        i += 2; // consume ii-V
                        continue;
                    }
                }
            }
            result.push(degreeArr[i]);
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

    function predictTargetDegree(vDegStr, vNoteIdx, allDegs) {
        // The target would resolve a P5 above V (or P4 below)
        // Return the bare degree number as best guess
        const targetNoteIdx = (vNoteIdx + 7) % 12;
        // Try to find this in allDegs
        return extractBareNumber(vDegStr) || '?';
    }

    // ── All Available Keys ───────────────────────────────────────
    function allKeys() {
        return [
            // Major
            { value: 'C',   label: 'C Maior',   isMinor: false },
            { value: 'G',   label: 'G Maior',   isMinor: false },
            { value: 'D',   label: 'D Maior',   isMinor: false },
            { value: 'A',   label: 'A Maior',   isMinor: false },
            { value: 'E',   label: 'E Maior',   isMinor: false },
            { value: 'B',   label: 'B Maior',   isMinor: false },
            { value: 'F#',  label: 'F# Maior',  isMinor: false },
            { value: 'F',   label: 'F Maior',   isMinor: false },
            { value: 'Bb',  label: 'Bb Maior',  isMinor: false },
            { value: 'Eb',  label: 'Eb Maior',  isMinor: false },
            { value: 'Ab',  label: 'Ab Maior',  isMinor: false },
            { value: 'Db',  label: 'Db Maior',  isMinor: false },
            { value: 'Gb',  label: 'Gb Maior',  isMinor: false },
            // Minor
            { value: 'Am',  label: 'A Menor',   isMinor: true  },
            { value: 'Em',  label: 'E Menor',   isMinor: true  },
            { value: 'Bm',  label: 'B Menor',   isMinor: true  },
            { value: 'F#m', label: 'F# Menor',  isMinor: true  },
            { value: 'C#m', label: 'C# Menor',  isMinor: true  },
            { value: 'G#m', label: 'G# Menor',  isMinor: true  },
            { value: 'Dm',  label: 'D Menor',   isMinor: true  },
            { value: 'Gm',  label: 'G Menor',   isMinor: true  },
            { value: 'Cm',  label: 'C Menor',   isMinor: true  },
            { value: 'Fm',  label: 'F Menor',   isMinor: true  },
            { value: 'Bbm', label: 'Bb Menor',  isMinor: true  },
            { value: 'Ebm', label: 'Eb Menor',  isMinor: true  },
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
            const actualRoot  = rootName.replace(/m$/, '');
            const actualMinor = isMinor || rootName.endsWith('m');
            const keyState = makeKeyState(actualRoot, actualMinor);
            const tokens   = tokenize(harmonyStr);
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

            const actualRoot  = rootName.replace(/m$/, '');
            const actualMinor = isMinor || rootName.endsWith('m');
            const keyState    = makeKeyState(actualRoot, actualMinor);

            // Parse chord list (accepts space or dash separators)
            const chords = chordsStr
                .replace(/\s*-\s*/g, ' ')
                .trim()
                .split(/\s+/)
                .filter(Boolean);

            // Map chords to degree tokens
            const degreeArr  = chords.map(c => analyzeChord(c, keyState));

            // Collect note indices for pattern detection
            const noteIdxArr = chords.map(c => {
                const parsed = parseChordStr(c);
                return parsed ? noteToIdx(parsed.root) : -1;
            });

            // Apply cadence pattern recognition
            const refined = detectCadencePatterns(degreeArr, noteIdxArr);

            return refined.join(' ');
        },

        allKeys,

        // For unit testing
        _noteToIdx: noteToIdx,
        _idxToNote: idxToNote,
        _renderDegreeToken: renderDegreeToken,
    };

    console.info('[HMS] HarmonyEngine loaded.');
})();
