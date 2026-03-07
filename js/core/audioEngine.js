/**
 * HMS — Audio Engine
 * Plays chord sequences using Tone.js
 */
(function () {
    'use strict';

    let synth = null;
    let isPlaying = false;
    let part = null;

    async function initSynth() {
        if (!synth) {
            await Tone.start();
            // A plucky, guitar/harp-like FM synth
            synth = new Tone.PolySynth(Tone.FMSynth, {
                harmonicity: 3.0,
                modulationIndex: 10,
                oscillator: { type: "sine" },
                envelope: {
                    attack: 0.01,
                    decay: 1.5,
                    sustain: 0.1,
                    release: 1.2
                },
                modulation: { type: "square" },
                modulationEnvelope: {
                    attack: 0.01,
                    decay: 0.5,
                    sustain: 0.0,
                    release: 0.1
                }
            }).toDestination();
            synth.volume.value = -8; // reduce volume slightly
        }
        return synth;
    }

    const INTERVALS = {
        '': [0, 4, 7],           // Major
        'm': [0, 3, 7],          // Minor
        '7': [0, 4, 7, 10],      // Dom 7
        'm7': [0, 3, 7, 10],     // Min 7
        'M7': [0, 4, 7, 11],     // Maj 7
        'h': [0, 3, 6, 10],      // Half-Dim
        'm7(b5)': [0, 3, 6, 10],
        '°': [0, 3, 6, 9],       // Dim 7
        'dim': [0, 3, 6, 9],
        'sus4': [0, 5, 7],
        'sus2': [0, 2, 7]
    };

    function parseChordToNotes(chordStr) {
        if (!chordStr || chordStr === '/' || chordStr.startsWith('[')) return null;

        const m = chordStr.match(/^([A-G][b#]?)(.*)/);
        if (!m) return null;

        const rootStr = m[1];
        let quality = m[2].trim();

        const rootIdx = window.HarmonyEngine._noteToIdx(rootStr);
        if (rootIdx === undefined || rootIdx === null) return null;

        // Simplify quality matching (some normalization)
        if (!INTERVALS[quality]) {
            if (quality.includes('m') && !quality.includes('M7')) quality = 'm';
            else quality = '';
        }

        const intervals = INTERVALS[quality] || INTERVALS[''];

        // Base octave 3 (C3 = 48)
        return intervals.map(inter => {
            const rawNote = rootIdx + inter;
            return Tone.Frequency(48 + rawNote, "midi").toNote();
        });
    }

    const AudioEngine = {
        async playSequence(tokens, onStop) {
            if (isPlaying) {
                this.stop();
                if (onStop) onStop();
                return;
            }

            await initSynth();
            isPlaying = true;

            const events = [];
            let time = 0;
            const BEAT_DURATION = 1.0; // 1 second per structural token (chord or slash)

            let lastChordNotes = [];

            for (const token of tokens) {
                if (token.type === 'CHORD') {
                    const notes = parseChordToNotes(token.value);
                    if (notes) {
                        events.push({ time, notes });
                        lastChordNotes = notes;
                    }
                } else if (token.type === 'STRUCT' && token.value === '/') {
                    // repeat last chord
                    if (lastChordNotes.length > 0) {
                        events.push({ time, notes: lastChordNotes });
                    }
                }

                // Increment time only for musical events, not structural brackets
                if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) {
                    time += BEAT_DURATION;
                }
            }

            part = new Tone.Part((t, value) => {
                // Strumming effect (slight delay between notes)
                value.notes.forEach((note, i) => {
                    synth.triggerAttackRelease(note, "2n", t + (i * 0.02));
                });
            }, events).start(0);

            Tone.Transport.start();

            // Stop transport when part finishes
            const duration = time;
            Tone.Transport.scheduleOnce(() => {
                this.stop();
                if (onStop) onStop();
            }, `+${duration}`);
        },

        stop() {
            if (part) {
                part.dispose();
                part = null;
            }
            Tone.Transport.stop();
            Tone.Transport.cancel(0);
            isPlaying = false;
        },

        get isPlaying() {
            return isPlaying;
        }
    };

    window.HMSAudio = AudioEngine;
    console.info('[HMS] AudioEngine loaded.');
})();
