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

            // Using a realistic Acoustic Guitar Sampler via a public CDN 
            // from Tone.js's standard sound library (Salamander / Guitar)
            return new Promise((resolve) => {
                synth = new Tone.Sampler({
                    urls: {
                        "A2": "A2.mp3",
                        "A3": "A3.mp3",
                        "A4": "A4.mp3",
                        "C3": "C3.mp3",
                        "C4": "C4.mp3",
                        "C5": "C5.mp3",
                        "E2": "E2.mp3",
                        "E3": "E3.mp3",
                        "E4": "E4.mp3"
                    },
                    baseUrl: "https://tonejs.github.io/audio/salamander/",
                    release: 1.5,
                    onload: () => {
                        // Add a slight reverb to simulate the guitar body
                        const reverb = new Tone.Reverb({
                            decay: 2.5,
                            preDelay: 0.01
                        }).toDestination();

                        synth.connect(reverb);
                        synth.volume.value = -2; // Default piano samples are quiet
                        resolve(synth);
                    }
                });
            });
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
        async playSequence(tokens, bpm = 60, onStop) {
            if (isPlaying) {
                this.stop();
                if (onStop) onStop();
                return;
            }

            await initSynth();
            isPlaying = true;

            const events = [];
            let time = 0;
            const BEAT_DURATION = 60.0 / bpm; // Adjust duration based on BPM

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

            Tone.Transport.bpm.value = bpm;

            part = new Tone.Part((t, value) => {
                // Strumming effect: longer delay between notes for a guitar feel
                value.notes.forEach((note, i) => {
                    synth.triggerAttackRelease(note, "2n", t + (i * 0.035));
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
