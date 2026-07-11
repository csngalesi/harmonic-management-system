/**
 * HMS — Audio Engine
 * Plays chord sequences using Tone.js (v14.x)
 * Exposed via window.HMSAudio
 *
 * Modes:
 *   playSequence(tokens, bpm, onFinished, 'basic')    — original piano strum
 *   playSequence(tokens, bpm, onFinished, 'violao24') — guitar simulation, 2/4 pattern
 */
(function () {
    'use strict';

    let sampler      = null;    // Tone.Sampler  (piano, lazy-loaded)
    let guitarPool   = [];      // PluckSynth[]  (guitar pool, round-robin)
    let guitarFilter = null;    // Tone.Filter   (warmth)
    let guitarPoolIdx = 0;
    const GUITAR_POOL_SIZE = 8; // polyphony limit
    let reverb       = null;    // Tone.Reverb   (shared)
    let part         = null;
    let part2        = null;
    let _isPlaying   = false;

    // ── Shared reverb ────────────────────────────────────────────
    async function ensureReverb() {
        if (reverb) return;
        reverb = new Tone.Reverb({ decay: 2.0, preDelay: 0.01, wet: 0.22 });
        await reverb.generate();
        reverb.toDestination();
    }

    // ── Piano Sampler (Salamander) ───────────────────────────────
    async function ensureSynth() {
        if (sampler) return;
        await Tone.start();
        await ensureReverb();
        await new Promise((resolve, reject) => {
            sampler = new Tone.Sampler({
                urls: {
                    A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3',
                    C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3',
                },
                baseUrl: 'https://tonejs.github.io/audio/salamander/',
                release: 1.5,
                onload:  resolve,
                onerror: (err) => { sampler = null; reject(new Error('Sampler load failed: ' + (err?.message ?? err))); },
            });
        });
        sampler.connect(reverb);
        sampler.volume.value = -2;
        console.info('[AudioEngine] Piano sampler ready ✓');
    }

    // ── Guitar Pool (Karplus-Strong, individual PluckSynths) ────
    // PolySynth(PluckSynth) is broken in Tone.js v14 because PluckSynth
    // is monophonic and incompatible with PolySynth's voice allocator.
    // Instead we keep a fixed pool of PluckSynths and round-robin.
    async function ensureGuitar() {
        if (guitarPool.length > 0) return;
        await Tone.start();
        await ensureReverb();
        // Low-pass filter for body warmth
        guitarFilter = new Tone.Filter({ frequency: 2200, type: 'lowpass', rolloff: -12 });
        guitarFilter.connect(reverb);
        // Create individual PluckSynth voices
        for (let i = 0; i < GUITAR_POOL_SIZE; i++) {
            const ps = new Tone.PluckSynth({
                attackNoise: 1.8,
                dampening:   3200,
                resonance:   0.90,
            });
            ps.volume.value = 2;
            ps.connect(guitarFilter);
            guitarPool.push(ps);
        }
        guitarPoolIdx = 0;
        console.info('[AudioEngine] Guitar pool ready ✓', GUITAR_POOL_SIZE, 'voices');
    }

    function pluckNote(note, audioTime) {
        const voice = guitarPool[guitarPoolIdx];
        guitarPoolIdx = (guitarPoolIdx + 1) % GUITAR_POOL_SIZE;
        try { voice.triggerAttack(note, audioTime); }
        catch (e) { console.warn('[Guitar] triggerAttack error:', note, e.message); }
    }

    // ── Chord → Notes ────────────────────────────────────────────
    const INTERVALS = {
        '':       [0, 4, 7],
        'm':      [0, 3, 7],
        '7':      [0, 4, 7, 10],
        'm7':     [0, 3, 7, 10],
        'M7':     [0, 4, 7, 11],
        'h':      [0, 3, 6, 10],
        'm7(b5)': [0, 3, 6, 10],
        '°':      [0, 3, 6, 9],
        'dim':    [0, 3, 6, 9],
        'sus4':   [0, 5, 7],
        'sus2':   [0, 2, 7],
    };

    function _parseRoot(chordStr) {
        if (!chordStr || chordStr === '/' || chordStr.startsWith('[')) return null;
        const m = chordStr.match(/^([A-G][b#]?)(.*)/);
        if (!m) return null;
        let quality = m[2].trim();
        const rootIdx = window.HarmonyEngine._noteToIdx(m[1]);
        if (rootIdx == null) return null;
        if (!INTERVALS[quality]) quality = (quality.includes('m') && !quality.includes('M7')) ? 'm' : '';
        return { rootIdx, quality };
    }

    /** Piano mode: [root, 3rd, 5th] at C3 base */
    function parseChordToNotes(chordStr) {
        const r = _parseRoot(chordStr);
        if (!r) return null;
        const BASE = 48; // C3
        return (INTERVALS[r.quality] || INTERVALS['']).map(i =>
            Tone.Frequency(BASE + r.rootIdx + i, 'midi').toNote()
        );
    }

    /**
     * Guitar strum mode: returns { bass, low, high }
     *   bass — root note in C2 register (single string, grave)
     *   low  — chord tones in C3 register (down-stroke, grave→agudo)
     *   high — upper chord tones in C4 register (up-stroke, agudo→grave)
     */
    function parseChordToStrumNotes(chordStr) {
        const r = _parseRoot(chordStr);
        if (!r) return null;
        const ivs  = INTERVALS[r.quality] || INTERVALS[''];
        const ROOT = r.rootIdx;
        const bass = [Tone.Frequency(36 + ROOT, 'midi').toNote()];        // C2 register — single bass string
        const low  = ivs.map(i => Tone.Frequency(48 + ROOT + i, 'midi').toNote()); // C3 — mid strings
        const high = ivs.slice(1).map(i => Tone.Frequency(60 + ROOT + i, 'midi').toNote()); // C4 — upper strings (no root)
        return { bass, low, high };
    }

    // ── Violão 2/4 strum builder ─────────────────────────────────
    /**
     * Builds a flat event list with stagger and velocity for each chord.
     * Pattern per chord slot (BEAT_S = 60/bpm seconds):
     *
     *   t + 0.000          : bass string (root, C2) — forte
     *   t + 0.050 + n*0.025: down-stroke (C3 register, low→high, 3 strings) — médio
     *   t + BEAT_S * 0.5   : up-stroke   (C4 register, high→low, 2 strings) — suave
     */
    function buildStrumEvents(tokens, bpm) {
        const BEAT_S = 60 / bpm;
        const events = [];
        let t = 0;
        let lastNotes = null;

        for (const token of tokens) {
            let notes = null;
            if (token.type === 'CHORD') {
                notes = parseChordToStrumNotes(token.value);
                if (notes) lastNotes = notes;
            } else if (token.type === 'STRUCT' && token.value === '/') {
                notes = lastNotes;
            }

            if (notes) {
                const { bass, low, high } = notes;
                const half = BEAT_S * 0.5;

                // ① Bass string — forte
                bass.forEach(n => {
                    events.push({ time: t, note: n, vel: 0.88, dur: BEAT_S * 0.50 });
                });
                // ② Down-stroke: low strings (left→right on guitar), stagger 25 ms
                low.forEach((n, i) => {
                    events.push({ time: t + 0.05 + i * 0.025, note: n, vel: 0.72, dur: BEAT_S * 0.88 });
                });
                // ③ Up-stroke (contra-tempo): high strings reversed, stagger 15 ms, soft
                high.slice().reverse().forEach((n, i) => {
                    events.push({ time: t + half + i * 0.015, note: n, vel: 0.40, dur: BEAT_S * 0.42 });
                });
            }

            if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) {
                t += BEAT_S;
            }
        }
        return { events, totalTime: t };
    }

    // ── Public API ───────────────────────────────────────────────
    const AudioEngine = {

        get isPlaying() { return _isPlaying; },

        /**
         * Play an array of ResultTokens (from HarmonyEngine.translate).
         * @param {Array}    tokens     - ResultToken[]
         * @param {number}   bpm        - beats per minute
         * @param {Function} onFinished - called when sequence ends naturally
         * @param {string}   strumMode  - 'basic' (piano) | 'violao24' (guitar 2/4)
         */
        async playSequence(tokens, bpm = 60, onFinished, strumMode = 'basic') {
            AudioEngine.stop();

            // ── Violão 2/4 mode ──────────────────────────────────
            if (strumMode === 'violao24') {
                let dbg = null;
                try {
                    await ensureGuitar();
                } catch (err) {
                    console.error('[Guitar] init failed:', err);
                    window.HMSApp?.showToast('DEBUG Violão: falha ao inicializar synth — ' + err.message, 'error');
                    return;
                }

                const { events, totalTime } = buildStrumEvents(tokens, bpm);
                if (events.length === 0) {
                    window.HMSApp?.showToast('DEBUG Violão: nenhuma nota gerada (tokens vazios?)', 'warning');
                    console.warn('[AudioEngine] No events for violao24 mode.', tokens);
                    return;
                }
                console.info(`[Guitar] ${events.length} events, totalTime=${totalTime.toFixed(2)}s, bpm=${bpm}`);

                Tone.Transport.cancel();
                Tone.Transport.stop();
                Tone.Transport.position = 0;
                Tone.Transport.bpm.value = bpm;
                Tone.Transport.timeSignature = [2, 4];

                part = new Tone.Part((audioTime, value) => {
                    pluckNote(value.note, audioTime);
                }, events);
                part.start(0);

                _isPlaying = true;
                Tone.Transport.start('+0.05');

                Tone.Transport.scheduleOnce(() => {
                    AudioEngine.stop();
                    if (onFinished) onFinished();
                }, totalTime + 3.5);
                return;
            }

            // ── Basic (piano) mode ───────────────────────────────
            await ensureSynth();

            const BEAT_S  = 60 / bpm;
            const events  = [];
            let   t       = 0;
            let   lastNotes = [];

            for (const token of tokens) {
                let notes = null;
                if (token.type === 'CHORD') {
                    notes = parseChordToNotes(token.value);
                    if (notes) lastNotes = notes;
                } else if (token.type === 'STRUCT' && token.value === '/') {
                    notes = lastNotes.length ? [...lastNotes] : null;
                }
                if (notes) events.push({ time: t, notes });
                if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) {
                    t += BEAT_S;
                }
            }

            if (events.length === 0) {
                console.warn('[AudioEngine] No playable chords in token list.');
                return;
            }

            Tone.Transport.cancel();
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;

            part = new Tone.Part((audioTime, value) => {
                value.notes.forEach((note, i) => {
                    sampler.triggerAttackRelease(note, '2n', audioTime + i * 0.04);
                });
            }, events);
            part.start(0);

            _isPlaying = true;
            Tone.Transport.start('+0.05');

            Tone.Transport.scheduleOnce(() => {
                AudioEngine.stop();
                if (onFinished) onFinished();
            }, t + 2.5);
        },

        /**
         * Play a processed melody array from MelodyEngine.translate().
         */
        async playMelody(notes, bpm = 80, onFinished, timeSig = '4/4') {
            AudioEngine.stop();
            await ensureSynth();

            if (!notes || notes.length === 0) return;

            const events = [];
            let t = 0;
            let i = 0;
            while (i < notes.length) {
                const n = notes[i];
                const durSec = window.MelodyEngine.durToSeconds(n.dur, bpm);
                if (!n.note) {
                    t += durSec; i++;
                } else if (n.tie) {
                    let totalSec = durSec;
                    let j = i + 1;
                    while (j < notes.length && notes[j - 1].tie) {
                        totalSec += window.MelodyEngine.durToSeconds(notes[j].dur, bpm);
                        j++;
                    }
                    events.push({ time: t, note: n.note, durSec: totalSec });
                    t += totalSec; i = j;
                } else {
                    events.push({ time: t, note: n.note, durSec });
                    t += durSec; i++;
                }
            }

            Tone.Transport.cancel();
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;
            const tsParts = String(timeSig).split('/');
            Tone.Transport.timeSignature = [parseInt(tsParts[0]) || 4, parseInt(tsParts[1]) || 4];

            part = new Tone.Part((audioTime, value) => {
                sampler.triggerAttackRelease(value.note, value.durSec, audioTime);
            }, events);
            part.start(0);

            _isPlaying = true;
            Tone.Transport.start('+0.05');

            Tone.Transport.scheduleOnce(() => {
                AudioEngine.stop();
                if (onFinished) onFinished();
            }, t + 2.0);
        },

        /**
         * Play melody and chord sequence simultaneously.
         */
        async playAll(notes, tokens, bpm = 80, onFinished) {
            AudioEngine.stop();
            await ensureSynth();

            if (!notes || notes.length === 0) return;

            const melodyEvents = [];
            let mt = 0;
            for (const n of notes) {
                if (n.note) melodyEvents.push({ time: mt, note: n.note, dur: n.dur });
                mt += window.MelodyEngine.durToSeconds(n.dur, bpm);
            }

            const BEAT_S = 60 / bpm;
            const chordEvents = [];
            let ct = 0;
            let lastNotes = [];
            for (const token of (tokens || [])) {
                let cNotes = null;
                if (token.type === 'CHORD') {
                    cNotes = parseChordToNotes(token.value);
                    if (cNotes) lastNotes = cNotes;
                } else if (token.type === 'STRUCT' && token.value === '/') {
                    cNotes = lastNotes.length ? [...lastNotes] : null;
                }
                if (cNotes) chordEvents.push({ time: ct, notes: cNotes });
                if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) {
                    ct += BEAT_S;
                }
            }

            Tone.Transport.cancel();
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;

            part = new Tone.Part((audioTime, value) => {
                sampler.triggerAttackRelease(value.note, value.dur, audioTime);
            }, melodyEvents);
            part.start(0);

            if (chordEvents.length > 0) {
                part2 = new Tone.Part((audioTime, value) => {
                    value.notes.forEach((note, i) => {
                        sampler.triggerAttackRelease(note, '2n', audioTime + i * 0.04);
                    });
                }, chordEvents);
                part2.start(0);
            }

            _isPlaying = true;
            Tone.Transport.start('+0.05');

            const totalDuration = Math.max(mt, ct) + 2.5;
            Tone.Transport.scheduleOnce(() => {
                AudioEngine.stop();
                if (onFinished) onFinished();
            }, totalDuration);
        },

        /**
         * Play melody and chords with explicit chord timings.
         */
        async playAllWithTimings(notes, chordTimings, bpm = 80, onFinished) {
            AudioEngine.stop();
            await ensureSynth();

            if (!notes || notes.length === 0) return;

            const melodyEvents = [];
            let mt = 0;
            for (const n of notes) {
                if (n.note) melodyEvents.push({ time: mt, note: n.note, dur: n.dur });
                mt += window.MelodyEngine.durToSeconds(n.dur, bpm);
            }

            const chordEvents = (chordTimings || []).map(ct => {
                const cNotes = parseChordToNotes(ct.chord);
                return cNotes ? { time: ct.time, notes: cNotes, duration: ct.duration } : null;
            }).filter(Boolean);

            Tone.Transport.cancel();
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;

            part = new Tone.Part((audioTime, value) => {
                sampler.triggerAttackRelease(value.note, value.dur, audioTime);
            }, melodyEvents);
            part.start(0);

            if (chordEvents.length > 0) {
                part2 = new Tone.Part((audioTime, value) => {
                    const relDur = value.duration > 0 ? value.duration : (60 / bpm);
                    const noteDur = Math.max(relDur * 0.92, 0.05);
                    value.notes.forEach((note, i) => {
                        sampler.triggerAttackRelease(note, noteDur, audioTime + i * 0.03);
                    });
                }, chordEvents);
                part2.start(0);
            }

            _isPlaying = true;
            Tone.Transport.start('+0.05');

            const totalDuration = mt + 2.5;
            Tone.Transport.scheduleOnce(() => {
                AudioEngine.stop();
                if (onFinished) onFinished();
            }, totalDuration);
        },

        stop() {
            _isPlaying = false;
            if (part)  { part.stop();  part.dispose();  part  = null; }
            if (part2) { part2.stop(); part2.dispose(); part2 = null; }
            // guitarPool: PluckSynths self-decay, no explicit release needed
            guitarPoolIdx = 0;
            Tone.Transport.stop();
            Tone.Transport.cancel();
        },
    };

    window.HMSAudio = AudioEngine;
    console.info('[HMS] AudioEngine loaded.');
})();
