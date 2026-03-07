/**
 * HMS — Audio Engine
 * Plays chord sequences using Tone.js (v14.x)
 * Exposed via window.HMSAudio
 *
 * Bugs fixed vs. original:
 *  1. reverb.generate() must be AWAITED before .toDestination() — otherwise
 *     the reverb enters the signal chain with no impulse → total silence.
 *  2. Replaced Promise-constructor + .then() anti-pattern with async/await so
 *     that async errors are not silently swallowed.
 *  3. Tone.Transport.start('+0.05') — small lookahead avoids AudioContext
 *     scheduling glitch that skips the very first event.
 *  4. Explicit Transport reset (position = 0, cancel()) before each play.
 */
(function () {
    'use strict';

    let sampler    = null;   // Tone.Sampler (shared, lazy-loaded)
    let reverb     = null;   // Tone.Reverb  (shared, lazy-loaded)
    let part       = null;   // Current Tone.Part
    let _isPlaying = false;

    // ── Lazy Initialization ──────────────────────────────────────
    // Idempotent: safe to call multiple times; only loads once.
    async function ensureSynth() {
        if (sampler) return; // Already ready

        // ① Resume / unlock AudioContext — must be in user-gesture call chain
        await Tone.start();
        console.info('[AudioEngine] Tone.start() OK — AudioContext:', Tone.context.state);

        // ② Create Reverb and AWAIT generate() BEFORE connecting to destination
        //    BUG ORIGINAL: new Tone.Reverb({...}).toDestination() chains immediately,
        //    bypassing the async generate → reverb routes signal but outputs silence.
        reverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.01, wet: 0.25 });
        await reverb.generate();   // ← generates offline impulse response first
        reverb.toDestination();    // ← then wire into the audio graph
        console.info('[AudioEngine] Reverb ready.');

        // ③ Load Sampler — wrap onload/onerror in a proper Promise
        await new Promise((resolve, reject) => {
            sampler = new Tone.Sampler({
                urls: {
                    A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3',
                    C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3',
                },
                baseUrl: 'https://tonejs.github.io/audio/salamander/',
                release: 1.5,
                onload: () => {
                    console.info('[AudioEngine] Sampler loaded ✓');
                    resolve();
                },
                onerror: (err) => {
                    sampler = null; // allow retry on next call
                    reject(new Error('Sampler load failed: ' + (err?.message ?? err)));
                },
            });
        });

        // ④ Wire: sampler → reverb → destination
        sampler.connect(reverb);
        sampler.volume.value = -2; // Salamander samples are recorded quiet
        console.info('[AudioEngine] Signal chain: sampler → reverb → destination ✓');
    }

    // ── Chord → MIDI Notes ───────────────────────────────────────
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

    function parseChordToNotes(chordStr) {
        if (!chordStr || chordStr === '/' || chordStr.startsWith('[')) return null;

        const m = chordStr.match(/^([A-G][b#]?)(.*)/);
        if (!m) return null;

        const rootStr = m[1];
        let   quality = m[2].trim();
        const rootIdx = window.HarmonyEngine._noteToIdx(rootStr);
        if (rootIdx == null) return null;

        if (!INTERVALS[quality]) {
            quality = (quality.includes('m') && !quality.includes('M7')) ? 'm' : '';
        }

        const BASE_MIDI = 48; // C3 = 48
        return (INTERVALS[quality] || INTERVALS['']).map(interval =>
            Tone.Frequency(BASE_MIDI + rootIdx + interval, 'midi').toNote()
        );
    }

    // ── Public API ───────────────────────────────────────────────
    const AudioEngine = {

        get isPlaying() { return _isPlaying; },

        /**
         * Play an array of ResultTokens (from HarmonyEngine.translate).
         * @param {Array}    tokens     - ResultToken[]
         * @param {number}   bpm        - beats per minute
         * @param {Function} onFinished - called when sequence ends naturally
         */
        async playSequence(tokens, bpm = 60, onFinished) {
            // Stop any current playback cleanly first
            AudioEngine.stop();

            // Load sampler (no-op if already loaded)
            await ensureSynth();

            // ── Build event list ─────────────────────────────────
            const BEAT_S  = 60 / bpm; // seconds per "chord slot"
            const events  = [];
            let   t       = 0;
            let   lastNotes = [];

            for (const token of tokens) {
                let notes = null;

                if (token.type === 'CHORD') {
                    notes = parseChordToNotes(token.value);
                    if (notes) lastNotes = notes;
                } else if (token.type === 'STRUCT' && token.value === '/') {
                    // Repeat bar: reuse last chord
                    notes = lastNotes.length ? [...lastNotes] : null;
                }

                if (notes) events.push({ time: t, notes });

                // Advance timeline for playable slots
                if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) {
                    t += BEAT_S;
                }
            }

            if (events.length === 0) {
                console.warn('[AudioEngine] No playable chords in token list.');
                return;
            }
            console.info(`[AudioEngine] Scheduling ${events.length} chords at ${bpm} BPM`);

            // ── Reset Transport ──────────────────────────────────
            //   BUG ORIGINAL: no reset → replaying after stop left position mid-song.
            Tone.Transport.cancel();
            Tone.Transport.stop();
            Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;

            // ── Create Part ──────────────────────────────────────
            part = new Tone.Part((audioTime, value) => {
                // Strum effect: each note slightly offset (≈ guitar strum)
                value.notes.forEach((note, i) => {
                    sampler.triggerAttackRelease(note, '2n', audioTime + i * 0.04);
                });
            }, events);
            part.start(0);

            _isPlaying = true;

            // ── Start Transport with small lookahead ─────────────
            //   BUG ORIGINAL: start() with no offset can skip the very first
            //   scheduled event due to AudioContext internal scheduling lag.
            Tone.Transport.start('+0.05');

            // ── Auto-stop after all chords + release tail ────────
            const totalDuration = t + 2.5; // 2.5 s extra for release tails
            Tone.Transport.scheduleOnce(() => {
                AudioEngine.stop();
                if (onFinished) onFinished();
            }, totalDuration);
        },

        stop() {
            _isPlaying = false;
            if (part) { part.stop(); part.dispose(); part = null; }
            Tone.Transport.stop();
            Tone.Transport.cancel();
        },
    };

    window.HMSAudio = AudioEngine;
    console.info('[HMS] AudioEngine loaded.');
})();
