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
        //    Strip ¶ (pilcrow) — reserved as internal SEC_DOM placeholder; must not
        //    appear in user-entered strings or it collides with ¶N¶ substitutions.
        let str = harmonyStr
            .replace(/¶/g, '')
            .trim();

        // 2a. Extract [...]Nx sections BEFORE secDomSlash substitution so the
        // stored content is the raw original string (no ¶N¶ artifacts), enabling
        // correct recursive tokenize() and round-trip sanitize() output.
        const sections = [];
        str = str.replace(/\[([^\]]*)\](\d+)x/gi, (_, content, n) => {
            const i = sections.length;
            sections.push({ content: content.trim(), times: parseInt(n, 10), style: '[' });
            return ` §${i}§ `;
        });

        // 2b. Extract {section}xN blocks (same reason — raw content preserved)
        str = str.replace(/\{([^}]*)\}x(\d+)/g, (_, content, n) => {
            const i = sections.length;
            sections.push({ content: content.trim(), times: parseInt(n, 10), style: '{' });
            return ` §${i}§ `;
        });

        // 2c. Extract $...$ label spans (may contain spaces) BEFORE the whitespace split.
        //     Without this, "$é esse o dev$" would be split into ["$é","esse","o","dev$"]
        //     and none of the fragments would match the $...$ LABEL rule.
        //     Uses ¤N¤ as placeholder (¤ never appears in valid harmony strings).
        const dollarLabels = [];
        str = str.replace(/\$([^$]+)\$/g, (_, inner) => {
            const i = dollarLabels.length;
            dollarLabels.push(inner.trim());
            return ` ¤${i}¤ `;
        });

        // Pre-process SEC_DOM patterns that contain slashes (e.g. 5/(3/)) BEFORE
        // the global slash injection, which would otherwise break them.
        const secDomSlash = [];
        str = str.replace(
            /([b#1-7mMho7/]+)(\/?)(\(([^)]*)\)|"([^"]*)")/g,
            (match, prefixRaw, slashPre, _tFull, targetP, targetQ) => {
                const rawTarget = targetP !== undefined ? targetP : (targetQ || '');
                // Slash before target may be embedded as trailing '/' of the prefix group
                // (e.g. "2/5/(3/)": prefix captures "2/5/", slashPre captures "")
                const prefixEndsSlash = prefixRaw.endsWith('/');
                const cleanPrefix     = prefixEndsSlash ? prefixRaw.slice(0, -1) : prefixRaw;
                const slashBeforeTarget = prefixEndsSlash || slashPre === '/';
                const slashAfterTarget  = rawTarget.endsWith('/');
                if (!slashBeforeTarget && !slashAfterTarget) return match;
                const showTarget  = _tFull[0] === '(';
                const cleanTarget = rawTarget.replace(/\/$/, '');
                const i = secDomSlash.length;
                secDomSlash.push({
                    type: 'SEC_DOM',
                    prefix: parsePrefixStr(cleanPrefix),
                    target: cleanTarget,
                    showTarget,
                    slashBeforeTarget,
                    slashAfterTarget,
                });
                return ` ¶${i}¶ `;
            }
        );

        str = str.replace(/\//g, ' / '); // Ensure slashes are distinct structural tokens

        // Ensure bare [ ] { } that survived section extraction become their own tokens.
        // Preserve [1. and [2. (volta brackets) — they stay as a single token.
        str = str.replace(/\[(?![12]\.)/g, ' [ ');
        str = str.replace(/\]/g, ' ] ');
        str = str.replace(/\{/g, ' { ');
        str = str.replace(/\}/g, ' } ');

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
                tokens.push({ type: 'SECTION', content: s.content, times: s.times, style: s.style || '{' });
                continue;
            }

            // Dollar-label placeholder (¤N¤): restores $...$ spans that may have had spaces
            const dlM = raw.match(/^¤(\d+)¤$/);
            if (dlM) {
                tokens.push({ type: 'LABEL', value: dollarLabels[parseInt(dlM[1], 10)] });
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
            if (raw === '{') { tokens.push({ type: 'STRUCT', value: '{' }); continue; }
            if (raw === '}') { tokens.push({ type: 'STRUCT', value: '}' }); continue; }
            if (raw === '[1.') { tokens.push({ type: 'STRUCT', value: '[1.' }); continue; }
            if (raw === '[2.') { tokens.push({ type: 'STRUCT', value: '[2.' }); continue; }
            if (raw === '-') { tokens.push({ type: 'STRUCT', value: '-' }); continue; }
            if (raw === '+') { tokens.push({ type: 'STRUCT', value: '+' }); continue; }

            // 5.5 = V of V (dominant of the dominant).
            // E.g.: in C major → V of G → D7
            if (raw === '5.5') {
                tokens.push({ type: 'DOT_DEGREE', outer: '5', inner: '5' });
                continue;
            }

            // SEC_DOM with trailing chord(s): 5///(4///)4m/// → SEC_DOM + CHORD(s)
            // Also handles 5/(3/)251 → SEC_DOM + three CHORDs.
            // Slash chars are allowed in the prefix (e.g. 5///).
            const sdTrailM = raw.match(/^([b#1-7mMho7/]+)\((.+?)\)(.+)$/);
            if (sdTrailM && sdTrailM[3]) {
                tokens.push({
                    type: 'SEC_DOM',
                    prefix: parsePrefixStr(sdTrailM[1]),
                    target: sdTrailM[2],
                    showTarget: true,
                });
                const trailParts = parsePrefixStr(sdTrailM[3]);
                if (trailParts.length > 0 && trailParts.join('') === sdTrailM[3]) {
                    for (const p of trailParts) tokens.push({ type: 'CHORD', value: p });
                } else {
                    tokens.push({ type: 'CHORD', value: sdTrailM[3] });
                }
                continue;
            }

            // Secondary dominant: prefix + (target) or "target"
            // E.g.: 25(4), 57(6m), 5///"6", 5/"2"
            // Slash chars allowed in prefix (e.g. 5///).
            const sdM = raw.match(/^([b#1-7mMho7/]+)\((.+?)\)$/) ||
                raw.match(/^([b#1-7mMho7/]+)"(.+?)"$/);
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

            // Parenthesized bare degree: (2), (4m), (b3) → treat as chord
            // Handles standalone tokens like "(2)" that appear in section notation
            const parenDegM = raw.match(/^\(([b#]?[1-7][mMho7]*(?:\/[b#]?[1-7][mMho7]*)?)\)$/);
            if (parenDegM) {
                tokens.push({ type: 'CHORD', value: parenDegM[1] });
                continue;
            }

            // Parenthesized degree followed immediately by another degree: (4)4m → two chords
            const parenPlusDegM = raw.match(/^\(([b#]?[1-7][mMho7]*)\)([b#]?[1-7][mMho7]*)$/);
            if (parenPlusDegM) {
                tokens.push({ type: 'CHORD', value: parenPlusDegM[1] });
                tokens.push({ type: 'CHORD', value: parenPlusDegM[2] });
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

            // Standalone quoted string → section label: "A", "Intro", "2x"
            // Must come before safety net so "A" isn't swallowed as a chord.
            // No prefix → can never be a SEC_DOM hidden target (those require a degree prefix).
            if (/^"[^"]*"$/.test(raw)) {
                tokens.push({ type: 'LABEL', value: raw.slice(1, -1) });
                continue;
            }

            // Safety net: any token containing harmonic punctuation is never plain text.
            // Rule: ( ) / [ ] " { } together signal harmonic notation, not free text.
            if (/[()\/"\[\]{}]/.test(raw)) {
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
        // Include trailing slashes so "5///" stays "5///" and round-trips correctly.
        return str.match(/[b#]?[1-7][mMho7]*\/*/g) || [];
    }

    // ── State Machine Processor ──────────────────────────────────
    // Returns: Array of ResultToken { type: 'CHORD'|'STRUCT', value: string }
    function processTokens(tokens, keyState) {
        const result = [];

        for (const token of tokens) {

            if (token.type === 'MOD') {
                applyModulation(token.value, keyState);
                result.push({ type: 'MOD', value: token.value });

            } else if (token.type === 'STRUCT') {
                result.push({ type: 'STRUCT', value: token.value });

            } else if (token.type === 'CHORD') {
                result.push({ type: 'CHORD', value: renderDegreeToken(token.value, keyState) });

            } else if (token.type === 'SEC_DOM') {
                // Resolve target — plain degree ("4", "1m") or DOT_DEGREE ("5.5")
                const dotM = token.target.match(/^([b#]?)([1-7])\.([b#]?[1-7][mMho7]*)$/);
                let tNoteIdx, tIsMinor, targetChordStr;

                if (dotM) {
                    // DOT_DEGREE target e.g. "5.5": resolve outer then inner
                    const outerAcc = dotM[1], outerDeg = parseInt(dotM[2]), innerStr = dotM[3];
                    const outerNoteIdx = degreeNoteIdx(keyState, outerDeg, outerAcc);
                    const outerKey = {
                        rootIdx: outerNoteIdx,
                        isMinor: isMinorDegree(keyState, outerDeg),
                        useFlats: keyState.useFlats,
                    };
                    const innerM = innerStr.match(/^([b#]?)([1-7])([mM]?)$/);
                    const innerAcc  = innerM ? innerM[1] : '';
                    const innerDeg  = innerM ? parseInt(innerM[2]) : 5;
                    const innerMode = innerM ? innerM[3] : '';
                    tNoteIdx = degreeNoteIdx(outerKey, innerDeg, innerAcc);
                    if (innerMode === 'm')      tIsMinor = true;
                    else if (innerMode === 'M') tIsMinor = false;
                    else                        tIsMinor = isMinorDegree(outerKey, innerDeg);
                    targetChordStr = renderDegreeToken(innerStr, outerKey);
                } else {
                    const tM = token.target.match(/^([b#]?)([1-7])([mM]?)(.*)$/);
                    if (!tM) continue;
                    const tAcc = tM[1], tDeg = parseInt(tM[2]), tMode = tM[3];
                    tNoteIdx = degreeNoteIdx(keyState, tDeg, tAcc);
                    if (tMode === 'm')      tIsMinor = true;
                    else if (tMode === 'M') tIsMinor = false;
                    else                   tIsMinor = isMinorDegree(keyState, tDeg);
                    targetChordStr = renderDegreeToken(token.target, keyState);
                }

                const targetKey = {
                    rootIdx: tNoteIdx,
                    isMinor: tIsMinor,
                    useFlats: keyState.useFlats,
                };

                // Render each prefix chord relative to the TARGET key.
                // parsePrefixStr may include trailing '/' on tokens (e.g. "2/" from "2/5").
                // Emit those as STRUCT slashes between prefix chords (but not after the last
                // one — slashBeforeTarget handles the gap between last prefix and target).
                for (let pi = 0; pi < token.prefix.length; pi++) {
                    const pd = token.prefix[pi];
                    const hasSlash = pd.endsWith('/');
                    const cleanPd  = hasSlash ? pd.slice(0, -1) : pd;
                    result.push({ type: 'CHORD', value: renderDegreeToken(cleanPd, targetKey) });
                    if (hasSlash && pi < token.prefix.length - 1) {
                        result.push({ type: 'STRUCT', value: '/' });
                    }
                }

                // Optional slash between last prefix chord and target chord
                if (token.slashBeforeTarget) {
                    result.push({ type: 'STRUCT', value: '/' });
                }

                // Show target chord if parens notation
                if (token.showTarget) {
                    result.push({ type: 'CHORD', value: targetChordStr });
                }

                // Optional slash after target chord
                if (token.slashAfterTarget) {
                    result.push({ type: 'STRUCT', value: '/' });
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
                // Text tokens render as plain inline text, not inside a chord box.
                result.push({ type: 'LABEL', value: token.value });
            }
        }

        return result;
    }

    // Apply a modulation instruction to the keyState in-place
    function applyModulation(modStr, keyState) {
        if (modStr === 'm') {
            keyState.isMinor = true;
            // Recalculate useFlats: e.g. C→Cm needs Bb/Eb/Ab notation
            const newKey = idxToNote(keyState.rootIdx, false) + 'm';
            keyState.useFlats = FLAT_PREF.has(newKey) || FLAT_PREF.has(idxToNote(keyState.rootIdx, false));
            return;
        }
        if (modStr === 'M') {
            keyState.isMinor = false;
            // Recalculate useFlats for the major root
            const rootName = idxToNote(keyState.rootIdx, false);
            keyState.useFlats = FLAT_PREF.has(rootName);
            return;
        }

        // Full modulation: [b#]?[1-7][mM]
        const m = modStr.match(/^([b#]?)([1-7])([mM])$/);
        if (m) {
            const newRootIdx = degreeNoteIdx(keyState, parseInt(m[2]), m[1]);
            keyState.rootIdx = newRootIdx;
            keyState.isMinor = (m[3] === 'm');
            // Recalculate useFlats for the new key
            const newRootName = idxToNote(newRootIdx, false);
            const newKey = newRootName + (keyState.isMinor ? 'm' : '');
            keyState.useFlats = FLAT_PREF.has(newKey) || FLAT_PREF.has(newRootName);
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
                const r0  = rf[i]     ?? 0;
                const r1  = rf[i + 1] ?? 0;

                // ── V/V detection ("cinco do cinco"): dominant chord P4 below naturalV ──
                // Must come BEFORE the secondary dominant check.
                // Example: A7 in G major → (9+5)%12=2=D=naturalVIdx → emits "5.5"
                if (q1 === '7' && ((ni1 + 5) % 12) === naturalVIdx && ni1 !== naturalVIdx) {
                    result.push('5.5');
                    for (let s = 0; s < r0; s++) result.push('/');
                    i++; continue;
                }

                // ii-V detection (V must have dominant 7 quality)
                // Semantic gate: a chord can act as "ii" ONLY if it is:
                //   1. The natural ii of this key (degree 2, no explicit suffix, e.g. Am in G),
                //   2. Half-diminished (e.g. F#m7b5 — always ii in minor-key ii-V), OR
                //   3. A non-diatonic chord (has explicit quality suffix, e.g. Dm='5m').
                // Diatonic minor chords at other degrees (Bm=iii, Em=vi) are scale degrees,
                // NEVER the ii of any secondary ii-V pattern.
                const bareNum1   = parseInt(extractBareNumber(d1));
                const explicitQ1 = extractQuality(d1);           // '' = diatonic/natural
                const canBeII    = (explicitQ1 === '' && bareNum1 === 2)  // natural ii
                                || q1 === 'h' || q1 === 'm7(b5)'          // half-dim
                                || explicitQ1 !== '';                      // non-diatonic
                const isIIchord = canBeII && (q1 === 'm' || q1 === 'm7' || q1 === 'h' || q1 === 'm7(b5)');
                const isP4up    = ((ni1 + 5) % 12 === ni2);
                // Also skip grouping when BOTH ii and V are individually sustained (repeated),
                // so that e.g. Am/ D7/ is kept as two separate chords rather than merged as ii-V.
                if (isIIchord && q2 === '7' && isP4up && !(r0 > 0 && r1 > 0)) {
                    const targetIdx = (ni2 + 5) % 12; // V resolves P4 above its root

                    // hasI: the chord at i+2 has the right root note for the resolution
                    // hasITonic: that chord is NOT a dominant 7th (real tonic resolution)
                    const hasI      = (i + 2 < degreeArr.length && noteIdxArr[i + 2] === targetIdx);
                    const hasITonic = hasI && (getQ(degreeArr[i + 2]) !== '7');

                    if (hasITonic) {
                        // ii-V-I: consume 3 chords
                        // Never encode I-chord repeat inside SEC_DOM; emit excess repeats separately
                        const r2 = rf[i + 2] ?? 0;
                        const t  = tgt(degreeArr[i + 2]);
                        if (r0) {
                            result.push(mkSecDom('2/5', t, r1 > 0, false, true));
                        } else {
                            result.push(mkSecDom('25', t, r1 > 0, false, true));
                        }
                        // Emit excess I-chord beats separately (r2 extra appearances beyond 1st)
                        if (r2 > 0) {
                            result.push(t);
                            for (let s = 0; s < r2 - 1; s++) result.push('/');
                        }
                        i += 3; continue;
                    } else {
                        // ii-V without immediate tonic resolution → hidden target
                        // (includes: no chord at i+2, wrong root, or resolution is dominant chord)
                        const tDegNum = degForNote(targetIdx);
                        if (tDegNum === 1) {
                            // ii-V heading to the key's own tonic → emit bare degrees (no hidden target)
                            // e.g. Am D7 in G major → just "2 5", not "25\"1\""
                            result.push('2');
                            for (let s = 0; s < r0; s++) result.push('/');
                            result.push('5');
                            for (let s = 0; s < r1; s++) result.push('/');
                        } else {
                            const t = tDegNum ? String(tDegNum) : '?';
                            if (r0) {
                                result.push(mkSecDom('2/5', t, r1 > 0, false, false));
                            } else {
                                result.push(mkSecDom('25', t, r1 > 0, false, false));
                            }
                        }
                        i += 2; continue;
                    }
                }

                // Secondary dominant: non-natural-V chord with dominant quality resolving P4 up
                if (q1 === '7' && ((ni1 + 5) % 12 === ni2) && ni1 !== naturalVIdx) {
                    const r1cnt = r1; // rename for clarity
                    result.push(mkSecDom('5', tgt(d2), r0 > 0, false, true));
                    // Emit excess target beats separately
                    if (r1cnt > 0) {
                        result.push(tgt(d2));
                        for (let s = 0; s < r1cnt - 1; s++) result.push('/');
                    }
                    i += 2; continue;
                }
            }

            // ── Regular chord output ──────────────────────────────────────────────
            const repCnt = rf[i] ?? 0;
            const q_r    = getQ(degreeArr[i]);
            const ni_r   = noteIdxArr[i];

            // Natural V with dominant 7th (e.g. D7 in G major): emit bare degree.
            // The dominant-7th quality is implied for the V function; don't show '7' suffix.
            if (ni_r === naturalVIdx && q_r === '7') {
                result.push(extractBareNumber(degreeArr[i]));
                for (let s = 0; s < repCnt; s++) result.push('/');
                i++; continue;
            }

            // Standalone secondary dominant: non-diatonic dominant chord (not the natural V,
            // not the V/V) that was NOT consumed by the two-chord secondary dominant check above
            // (i.e., its resolution chord doesn't follow immediately).
            // Emit as 5"target" with the inferred hidden target.
            const isVofV         = ((ni_r + 5) % 12) === naturalVIdx;
            const isNaturalV     = ni_r === naturalVIdx;
            const isStandaloneSec = q_r === '7' && !isNaturalV && !isVofV;
            if (isStandaloneSec) {
                const tgtIdx   = (ni_r + 5) % 12;
                const tDegNum  = degForNote(tgtIdx);
                const t        = tDegNum ? String(tDegNum) : '?';
                // slashBefore encodes the first repeat; extra repeats follow as bare '/'
                const slashBefore = repCnt > 0;
                result.push(mkSecDom('5', t, slashBefore, false, false));
                for (let s = 0; s < repCnt - 1; s++) result.push('/');
                i++; continue;
            }

            result.push(degreeArr[i]);
            for (let s = 0; s < repCnt; s++) result.push('/');
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

            // Pre-process $...$ labels (may contain spaces) before split,
            // using the same placeholder trick as tokenize().
            // IMPORTANT: labels are extracted FIRST so their contents (e.g. "-")
            // are protected from the dash-removal step that follows.
            const dollarLabelsA = [];
            let preStr = chordsStr
                .replace(/\$([^$]+)\$/g, (_, inner) => {
                    const i = dollarLabelsA.length;
                    dollarLabelsA.push(inner.trim());
                    return ` ¤${i}¤ `;
                })
                .replace(/\s*-\s*/g, ' ')  // remove bare dashes (chord separators) but NOT inside labels
                .trim();

            const allTokens = preStr.trim().split(/\s+/).filter(Boolean);

            // We need to handle $texto$ tokens as opaque pass-through labels.
            // Build a mixed array of { kind: 'chord'|'label'|'slash', value, ni? } entries.
            const entries = []; // { kind: 'chord'|'slash'|'label', value, ni? }
            for (const c of allTokens) {
                // Dollar-label placeholder restored from pre-processing
                const dlM = c.match(/^¤(\d+)¤$/);
                if (dlM) {
                    entries.push({ kind: 'label', value: dollarLabelsA[parseInt(dlM[1], 10)] });
                    continue;
                }
                if (c === '/') {
                    entries.push({ kind: 'slash' });
                    continue;
                }
                const parsed = parseChordStr(c);
                const ni = parsed ? noteToIdx(parsed.root) : -1;
                entries.push({ kind: 'chord', value: c, ni });
            }


            // Re-assemble: extract chord-only sub-arrays, analyze them,
            // then weave labels and slashes back in.
            // Strategy: run the analysis on each contiguous run of chords,
            // keeping label/slash positions intact.
            const resultParts = []; // array of strings ready to join with ' '
            let chordBuf = [];   // current chord values
            let niBuf    = [];   // note indices for chordBuf
            let rfBuf    = [];   // repeat flags for chordBuf

            function flushChords() {
                if (!chordBuf.length) return;
                const degreeArr = chordBuf.map(c => analyzeChord(c, keyState));
                const refined   = detectCadencePatterns(degreeArr, niBuf, keyState, rfBuf);
                for (const r of refined) resultParts.push(r);
                chordBuf = []; niBuf = []; rfBuf = [];
            }

            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                if (e.kind === 'label') {
                    flushChords();
                    resultParts.push(`$${e.value}$`);
                } else if (e.kind === 'slash') {
                    // repeat beat — increment count for the previous chord
                    if (chordBuf.length > 0) rfBuf[rfBuf.length - 1]++;
                } else {
                    // chord
                    // Adjacent duplicate → increment repeat count instead of new chord
                    if (chordBuf.length > 0 &&
                        e.value === chordBuf[chordBuf.length - 1] &&
                        e.ni    === niBuf[niBuf.length - 1]) {
                        rfBuf[rfBuf.length - 1]++;
                    } else {
                        chordBuf.push(e.value);
                        niBuf.push(e.ni);
                        rfBuf.push(0); // integer count, not boolean
                    }
                }
            }
            flushChords();

            return resultParts.join(' ');
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
                    case 'LABEL':    parts.push(t.value); break;  // strip legacy $…$ wrappers
                    case 'MOD':      parts.push(`!${t.value}!`); break;
                    case 'RAW':      parts.push(t.value); break;  // plain text, no $ wrapping
                    case 'SEC_DOM': {
                        const prefix = t.prefix.join('');
                        const open   = t.showTarget ? '(' : '"';
                        const close  = t.showTarget ? ')' : '"';
                        const slashB = t.slashBeforeTarget ? '/' : '';
                        const slashA = t.slashAfterTarget  ? '/' : '';
                        parts.push(`${prefix}${slashB}${open}${t.target}${slashA}${close}`);
                        break;
                    }
                    case 'SECTION':
                        if (t.style === '[') parts.push(`[${t.content}]${t.times}x`);
                        else                 parts.push(`{${t.content}}x${t.times}`);
                        break;
                    case 'DOT_DEGREE': parts.push(`${t.outer}.${t.inner}`); break;
                }
            }
            // Merge adjacent $...$ tokens: "$A$ $B$" → "$A B$"
            return parts.join(' ').replace(/\$([^$]*)\$(\s+\$([^$]*)\$)+/g, (match) => {
                const texts = match.match(/\$([^$]*)\$/g).map(s => s.slice(1, -1));
                return `$${texts.join(' ')}$`;
            });
        },

        /**
         * Render a raw HMS functional harmony string as styled HTML chips.
         * Used for "Harm Func" display — shows degrees/labels as-typed, no transposition.
         *
         * Centralises what was previously duplicated as `buildFuncHtml` in UI components.
         * Correctly handles multi-word labels: $é esse o dev$ → single sd-label chip.
         *
         * @param {string}   str   - Raw HMS harmony string (e.g. "$mom$ 1 25(4) $Refrão$")
         * @param {Function} [esc] - HTML-escape fn; defaults to a safe built-in implementation
         * @returns {string} HTML — series of <span class="sd-chord|sd-label|sd-sep|sd-mod"> chips
         */
        renderFuncHtml(str, esc) {
            const _esc = esc || (s => String(s || '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

            if (!str || !str.trim()) {
                return '<span style="color:var(--text-muted);font-size:.85rem;">Sem harmonia cadastrada.</span>';
            }

            const tokens = tokenize(str);
            if (!tokens.length) {
                return '<span style="color:var(--text-muted);font-size:.85rem;">Sem harmonia cadastrada.</span>';
            }

            // Recursively renders a flat token array → HTML chip array
            function renderToks(toks) {
                const out = [];
                for (const t of toks) {
                    switch (t.type) {

                        case 'LABEL':
                        case 'RAW':
                            out.push(`<span class="sd-label">${_esc(t.value)}</span>`);
                            break;

                        case 'MOD':
                            out.push(`<span class="sd-mod">${_esc('!' + t.value + '!')}</span>`);
                            break;

                        case 'STRUCT':
                            if (t.value === '/') {
                                out.push(`<span class="sd-chord">/</span>`);
                            } else {
                                out.push(`<span class="sd-sep">${_esc(t.value) || '·'}</span>`);
                            }
                            break;

                        case 'CHORD':
                            out.push(`<span class="sd-chord">${_esc(t.value)}</span>`);
                            break;

                        case 'DOT_DEGREE':
                            out.push(`<span class="sd-chord">${_esc(t.outer + '.' + t.inner)}</span>`);
                            break;

                        case 'SEC_DOM': {
                            // Reconstruct the original notation (e.g. "25(4)", "5/(3/)")
                            const prefix = t.prefix.join('');
                            const open   = t.showTarget ? '(' : '"';
                            const close  = t.showTarget ? ')' : '"';
                            const slashB = t.slashBeforeTarget ? '/' : '';
                            const slashA = t.slashAfterTarget  ? '/' : '';
                            out.push(`<span class="sd-chord">${_esc(prefix + slashB + open + t.target + slashA + close)}</span>`);
                            break;
                        }

                        case 'SECTION': {
                            // Render inner content, then append ×N marker if N > 1
                            const innerToks = tokenize(t.content);
                            out.push(...renderToks(innerToks));
                            if (t.times > 1) {
                                out.push(`<span class="sd-sep">${_esc('×' + t.times)}</span>`);
                            }
                            break;
                        }
                    }
                }
                return out;
            }

            return renderToks(tokens).join('');
        },

        allKeys,

        /** Returns raw functional tokens (no transposition). */
        tokenize,

        // For unit testing
        _noteToIdx: noteToIdx,
        _idxToNote: idxToNote,
        _renderDegreeToken: renderDegreeToken,
    };

    console.info('[HMS] HarmonyEngine loaded.');
})();
