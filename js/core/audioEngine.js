/**
 * HMS — Audio Engine
 * Plays chord sequences using Tone.js (v14.x)
 * Exposed via window.HMSAudio
 *
 * strumMode values for playSequence:
 *   'basic'    — piano strum (original)
 *   'violao24' — 2/4 guitar pattern; synthType in _gParams controls the synth
 *
 * Guitar synthTypes (_gParams.synthType):
 *   'pluck'    — PluckSynth pool (Karplus-Strong)
 *   'polyperc' — PolySynth(Synth) with percussive envelope (triangle wave)
 *   'piano'    — Salamander piano sampler with short durations
 */
(function () {
    'use strict';

    let sampler         = null;   // Tone.Sampler      (piano, lazy)
    let guitarPool      = [];     // PluckSynth[]      (pluck mode)
    let guitarPolySynth = null;   // Tone.PolySynth    (polyperc mode)
    let guitarPoolIdx   = 0;
    const GUITAR_POOL   = 8;
    let reverb          = null;   // Tone.Reverb       (shared)
    let part            = null;
    let part2           = null;
    let _isPlaying      = false;
    let _seqAbortFn     = null;   // cancela fila sequencial de samples

    // ── Guitar Sample Players (samples reais gravados pelo usuário) ─
    // Map key: `${instrument}|${chordStr}`  e.g. 'guitar|Am'
    const _samplePlayers = new Map();

    // ── Pitch-shift helper ────────────────────────────────────────
    // Converte raiz + acidente para índice cromático (0=C … 11=B)
    const _NOTE_ST = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    function _parseChordForPitch(chordStr) {
        const m = chordStr.match(/^([A-G][b#]?)(.*)/);
        if (!m) return null;
        let st = _NOTE_ST[m[1][0]];
        if (st === undefined) return null;
        if (m[1][1] === '#') st = (st + 1)  % 12;
        if (m[1][1] === 'b') st = (st + 11) % 12;
        return { semitone: st, quality: m[2] };
    }

    // Encontra o sample mais próximo da mesma quality e retorna {player, detuneCents}
    function _findNearestSample(chordStr, instrument) {
        const target = _parseChordForPitch(chordStr);
        if (!target) return null;

        let bestPlayer = null;
        let bestDetune = 0;
        let bestDist   = 13; // impossível — forçará substituição

        for (const [k, player] of _samplePlayers) {
            if (!k.startsWith(instrument + '|')) continue;
            if (!player.buffer?.loaded) continue;  // ignora buffers não carregados
            const kChord  = k.slice(instrument.length + 1);
            const kParsed = _parseChordForPitch(kChord);
            if (!kParsed || kParsed.quality !== target.quality) continue;

            // Distância cromática circular (máx = 6 semitons)
            let diff = target.semitone - kParsed.semitone;
            if (diff >  6) diff -= 12;
            if (diff < -6) diff += 12;
            const dist = Math.abs(diff);

            if (dist < bestDist) {
                bestDist   = dist;
                bestDetune = diff * 100;   // cents  (1 semitom = 100 cents)
                bestPlayer = player;
            }
        }

        if (!bestPlayer) return null;
        return { player: bestPlayer, detuneCents: bestDetune, semitons: bestDist };
    }

    // ── Guitar parameters (user-tunable) ─────────────────────────
    const _gParams = {
        synthType:   'polyperc', // 'pluck' | 'polyperc' | 'piano'
        attackNoise: 0.3,        // PluckSynth: pick noise (0.1–2.0)
        dampening:   4500,       // PluckSynth: string brightness (500–8000)
        resonance:   0.95,       // PluckSynth: sustain (0.5–0.99)
        decay:       0.45,       // polyperc: envelope decay in seconds (0.1–2.0)
    };

    // ── Shared Reverb ─────────────────────────────────────────────
    async function ensureReverb() {
        if (reverb) return;
        reverb = new Tone.Reverb({ decay: 2.0, preDelay: 0.01, wet: 0.20 });
        await reverb.generate();
        reverb.toDestination();
    }

    // ── Piano Sampler (Salamander) ────────────────────────────────
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
                onerror: (err) => { sampler = null; reject(new Error('Sampler: ' + (err?.message ?? err))); },
            });
        });
        sampler.connect(reverb);
        sampler.volume.value = -2;
        console.info('[AudioEngine] Piano sampler ready ✓');
    }

    // ── Guitar Synths ─────────────────────────────────────────────
    function _disposeGuitar() {
        guitarPool.forEach(ps => { try { ps.dispose(); } catch (_) {} });
        guitarPool = [];
        guitarPoolIdx = 0;
        if (guitarPolySynth) {
            try { guitarPolySynth.dispose(); } catch (_) {}
            guitarPolySynth = null;
        }
    }

    async function ensureGuitar() {
        const t = _gParams.synthType;
        if (t === 'piano') { await ensureSynth(); return; }
        if (t === 'pluck'    && guitarPool.length > 0) return;
        if (t === 'polyperc' && guitarPolySynth)       return;

        await Tone.start();
        await ensureReverb();

        if (t === 'polyperc') {
            // Triangle wave with percussive envelope — reliable polyphony
            guitarPolySynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: {
                    attack:  0.002,
                    decay:   _gParams.decay,
                    sustain: 0.0,
                    release: 0.3,
                },
            });
            guitarPolySynth.volume.value = -8;
            guitarPolySynth.connect(reverb);
            console.info('[AudioEngine] PolySynth percussivo ready ✓ decay=' + _gParams.decay);
        } else {
            // PluckSynth pool (Karplus-Strong)
            for (let i = 0; i < GUITAR_POOL; i++) {
                const ps = new Tone.PluckSynth({
                    attackNoise: _gParams.attackNoise,
                    dampening:   _gParams.dampening,
                    resonance:   _gParams.resonance,
                });
                ps.volume.value = -2;
                ps.connect(reverb);
                guitarPool.push(ps);
            }
            guitarPoolIdx = 0;
            console.info('[AudioEngine] PluckSynth pool ready ✓ x' + GUITAR_POOL);
        }
    }

    function _triggerGuitar(note, audioTime, vel) {
        const t = _gParams.synthType;
        if (t === 'piano') {
            if (sampler?.loaded) sampler.triggerAttackRelease(note, 0.35, audioTime, vel);
        } else if (t === 'polyperc') {
            try { guitarPolySynth.triggerAttack(note, audioTime, vel); } catch (e) { console.warn('[polyperc]', e.message); }
        } else {
            const voice = guitarPool[guitarPoolIdx];
            guitarPoolIdx = (guitarPoolIdx + 1) % GUITAR_POOL;
            try { voice.triggerAttack(note, audioTime); } catch (e) { console.warn('[pluck]', e.message); }
        }
    }

    // ── Chord → Notes ─────────────────────────────────────────────
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

    function parseChordToNotes(chordStr) {
        const r = _parseRoot(chordStr);
        if (!r) return null;
        return (INTERVALS[r.quality] || INTERVALS['']).map(i =>
            Tone.Frequency(48 + r.rootIdx + i, 'midi').toNote()
        );
    }

    function parseChordToStrumNotes(chordStr) {
        const r = _parseRoot(chordStr);
        if (!r) return null;
        const ivs  = INTERVALS[r.quality] || INTERVALS[''];
        const ROOT = r.rootIdx;
        // C3 (48) for bass — PluckSynth degrades below ~100Hz
        const bass = [Tone.Frequency(48 + ROOT, 'midi').toNote()];
        const low  = ivs.map(i => Tone.Frequency(55 + ROOT + i, 'midi').toNote()); // G3 register
        const high = ivs.slice(1).map(i => Tone.Frequency(64 + ROOT + i, 'midi').toNote()); // E4 register
        return { bass, low, high };
    }

    // ── 2/4 strum event builder ───────────────────────────────────
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

                bass.forEach(n =>
                    events.push({ time: t,                       note: n, vel: 0.85, dur: BEAT_S * 0.50 }));
                low.forEach((n, i) =>
                    events.push({ time: t + 0.04 + i * 0.012,   note: n, vel: 0.70, dur: BEAT_S * 0.88 }));
                high.slice().reverse().forEach((n, i) =>
                    events.push({ time: t + half + i * 0.009,   note: n, vel: 0.38, dur: BEAT_S * 0.42 }));
            }

            if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) {
                t += BEAT_S;
            }
        }
        return { events, totalTime: t };
    }

    // ── Public API ────────────────────────────────────────────────
    const AudioEngine = {

        get isPlaying() { return _isPlaying; },

        /** Returns a copy of current guitar params */
        getGuitarParams() { return { ..._gParams }; },

        /**
         * Update guitar params. Disposes existing synth so it's rebuilt
         * with new settings on next playSequence call.
         */
        setGuitarParams(params) {
            const typeChanged = params.synthType && params.synthType !== _gParams.synthType;
            Object.assign(_gParams, params);
            // Always dispose and rebuild so new params take effect
            _disposeGuitar();
            console.info('[Guitar] Params updated →', JSON.stringify(_gParams));
        },

        /**
         * @param {Array}    tokens
         * @param {number}   bpm
         * @param {Function} onFinished
         * @param {string}   strumMode      'basic' | 'violao24' | 'guitar-sample' | 'cavaco-sample'
         * @param {Function} onChordChange  (chordValue: string) → called each time a new chord plays
         */
        async playSequence(tokens, bpm = 60, onFinished, strumMode = 'basic', onChordChange = null) {
            AudioEngine.stop();

            // ── Violão 2/4 ───────────────────────────────────────
            if (strumMode === 'violao24') {
                try { await ensureGuitar(); }
                catch (err) {
                    window.HMSApp?.showToast('DEBUG Guitar init: ' + err.message, 'error');
                    console.error('[Guitar] init error', err);
                    return;
                }

                const { events, totalTime } = buildStrumEvents(tokens, bpm);
                if (events.length === 0) {
                    window.HMSApp?.showToast('DEBUG Guitar: 0 events gerados (harmonia vazia?)', 'warning');
                    return;
                }
                console.info(`[Guitar] mode=${_gParams.synthType} events=${events.length} total=${totalTime.toFixed(2)}s`);

                Tone.Transport.cancel();
                Tone.Transport.stop();
                Tone.Transport.position = 0;
                Tone.Transport.bpm.value = bpm;
                Tone.Transport.timeSignature = [2, 4];

                part = new Tone.Part((audioTime, ev) => {
                    _triggerGuitar(ev.note, audioTime, ev.vel);
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

            // ── Sample real: fila sequencial (sem BPM) ───────────────────
            if (strumMode === 'guitar-sample' || strumMode === 'cavaco-sample') {
                const instrument = strumMode === 'guitar-sample' ? 'guitar' : 'cavaco';

                await AudioEngine.loadGuitarSamplers(instrument);
                try { await ensureSynth(); } catch (_) {}

                // Monta lista ordenada de acordes
                const chords = [];
                let lastChord = null;
                for (const token of tokens) {
                    if (token.type === 'CHORD') {
                        chords.push(token.value);
                        lastChord = token.value;
                    } else if (token.type === 'STRUCT' && token.value === '/') {
                        if (lastChord) chords.push(lastChord);
                    }
                }
                if (chords.length === 0) return;

                _isPlaying = true;

                // Toca cada acorde e espera terminar antes do próximo
                let _chordIdx = 0;
                for (const chord of chords) {
                    if (!_isPlaying) break;

                    const normalizedChord = chord
                        .replace('m7(b5)', 'm7')
                        .replace(/([A-Gb#]+)h$/, '$1m7')
                        .replace(/([A-Gb#]+)[o°]$/, '$1dim');

                    // Notifica UI qual acorde está tocando (por índice e valor)
                    if (onChordChange) {
                        try { onChordChange(_chordIdx, chord); } catch (_) {}
                    }
                    _chordIdx++;

                    const key = `${instrument}|${normalizedChord}`;
                    let player = _samplePlayers.get(key);
                    let detune = 0;

                    console.debug(`[AudioEngine] seq chord="${chord}" normalized="${normalizedChord}" key="${key}" found=${!!player} totalLoaded=${_samplePlayers.size}`);

                    if (!player) {
                        const nearest = _findNearestSample(normalizedChord, instrument);
                        if (nearest) {
                            player = nearest.player;
                            detune = nearest.detuneCents;
                            console.debug(`[AudioEngine] pitch-shift fallback: ${detune > 0 ? '+' : ''}${nearest.semitons}st`);
                        } else {
                            console.warn(`[AudioEngine] sem sample para "${normalizedChord}" (${instrument})`);
                        }
                    }

                    let duration = 2.0;
                    const playerReady = player && player.buffer?.loaded;

                    if (playerReady) {
                        duration = player.buffer.duration ?? 2.0;
                        try {
                            // Sempre para antes de (re)iniciar — evita "already playing" do Tone.js
                            try { player.stop(); } catch (_) {}
                            player.detune = detune;
                            player.start();
                            if (detune !== 0) setTimeout(() => { try { player.detune = 0; } catch(_) {} }, duration * 1000 + 300);
                        } catch (e) { console.warn('[AudioEngine] seq play erro:', chord, e.message); }
                    } else {
                        // Buffer não carregado ou sample ausente — fallback piano
                        if (player && !player.buffer?.loaded) {
                            console.warn(`[AudioEngine] buffer NÃO carregado para "${chord}" (${instrument}) — usando piano fallback`);
                        }
                        if (sampler?.loaded) {
                            await ensureSynth();
                            const notes = parseChordToNotes(chord);
                            if (notes) notes.forEach((n, i) => sampler.triggerAttackRelease(n, '2n', Tone.now() + i * 0.04));
                        }
                    }

                    // Aguarda duração do sample antes do próximo (abortável)
                    await new Promise(resolve => {
                        const t = setTimeout(resolve, Math.round(duration * 1000));
                        _seqAbortFn = () => { clearTimeout(t); resolve(); };
                    });
                    _seqAbortFn = null;
                }

                _isPlaying = false;
                if (onFinished) onFinished();
                return;
            }


            // ── Basic (piano strum) ───────────────────────────────
            await ensureSynth();

            const BEAT_S = 60 / bpm;
            const events = [];
            let t = 0;
            let lastNotes = [];

            for (const token of tokens) {
                let notes = null;
                if (token.type === 'CHORD') {
                    notes = parseChordToNotes(token.value);
                    if (notes) lastNotes = notes;
                } else if (token.type === 'STRUCT' && token.value === '/') {
                    notes = lastNotes.length ? [...lastNotes] : null;
                }
                if (notes) events.push({ time: t, notes });
                if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) t += BEAT_S;
            }

            if (events.length === 0) return;

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
            Tone.Transport.scheduleOnce(() => { AudioEngine.stop(); if (onFinished) onFinished(); }, t + 2.5);
        },

        async playMelody(notes, bpm = 80, onFinished, timeSig = '4/4') {
            AudioEngine.stop();
            await ensureSynth();
            if (!notes || notes.length === 0) return;

            const events = [];
            let t = 0, i = 0;
            while (i < notes.length) {
                const n = notes[i];
                const durSec = window.MelodyEngine.durToSeconds(n.dur, bpm);
                if (!n.note) { t += durSec; i++; }
                else if (n.tie) {
                    let totalSec = durSec, j = i + 1;
                    while (j < notes.length && notes[j - 1].tie) { totalSec += window.MelodyEngine.durToSeconds(notes[j].dur, bpm); j++; }
                    events.push({ time: t, note: n.note, durSec: totalSec });
                    t += totalSec; i = j;
                } else {
                    events.push({ time: t, note: n.note, durSec });
                    t += durSec; i++;
                }
            }

            Tone.Transport.cancel(); Tone.Transport.stop(); Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;
            const ts = String(timeSig).split('/');
            Tone.Transport.timeSignature = [parseInt(ts[0]) || 4, parseInt(ts[1]) || 4];

            part = new Tone.Part((audioTime, v) => {
                sampler.triggerAttackRelease(v.note, v.durSec, audioTime);
            }, events);
            part.start(0);
            _isPlaying = true;
            Tone.Transport.start('+0.05');
            Tone.Transport.scheduleOnce(() => { AudioEngine.stop(); if (onFinished) onFinished(); }, t + 2.0);
        },

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
            let ct = 0, lastNotes = [];
            for (const token of (tokens || [])) {
                let cNotes = null;
                if (token.type === 'CHORD') { cNotes = parseChordToNotes(token.value); if (cNotes) lastNotes = cNotes; }
                else if (token.type === 'STRUCT' && token.value === '/') { cNotes = lastNotes.length ? [...lastNotes] : null; }
                if (cNotes) chordEvents.push({ time: ct, notes: cNotes });
                if (token.type === 'CHORD' || (token.type === 'STRUCT' && token.value === '/')) ct += BEAT_S;
            }

            Tone.Transport.cancel(); Tone.Transport.stop(); Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;

            part = new Tone.Part((audioTime, v) => { sampler.triggerAttackRelease(v.note, v.dur, audioTime); }, melodyEvents);
            part.start(0);

            if (chordEvents.length > 0) {
                part2 = new Tone.Part((audioTime, v) => {
                    v.notes.forEach((n, i) => sampler.triggerAttackRelease(n, '2n', audioTime + i * 0.04));
                }, chordEvents);
                part2.start(0);
            }

            _isPlaying = true;
            Tone.Transport.start('+0.05');
            Tone.Transport.scheduleOnce(() => { AudioEngine.stop(); if (onFinished) onFinished(); }, Math.max(mt, ct) + 2.5);
        },

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

            Tone.Transport.cancel(); Tone.Transport.stop(); Tone.Transport.position = 0;
            Tone.Transport.bpm.value = bpm;

            part = new Tone.Part((audioTime, v) => { sampler.triggerAttackRelease(v.note, v.dur, audioTime); }, melodyEvents);
            part.start(0);

            if (chordEvents.length > 0) {
                part2 = new Tone.Part((audioTime, v) => {
                    const dur = Math.max((v.duration > 0 ? v.duration : 60 / bpm) * 0.92, 0.05);
                    v.notes.forEach((n, i) => sampler.triggerAttackRelease(n, dur, audioTime + i * 0.03));
                }, chordEvents);
                part2.start(0);
            }

            _isPlaying = true;
            Tone.Transport.start('+0.05');
            Tone.Transport.scheduleOnce(() => { AudioEngine.stop(); if (onFinished) onFinished(); }, mt + 2.5);
        },

        stop() {
            _isPlaying = false;
            // Aborta fila sequencial de samples (violão/cavaco)
            if (_seqAbortFn) { _seqAbortFn(); _seqAbortFn = null; }
            // Para todos os sample players ativos
            for (const [, p] of _samplePlayers) {
                try { if (p.state === 'started') p.stop(); } catch (_) {}
            }
            if (part)  { part.stop();  part.dispose();  part  = null; }
            if (part2) { part2.stop(); part2.dispose(); part2 = null; }
            guitarPoolIdx = 0;
            Tone.Transport.stop();
            Tone.Transport.cancel();
        },

        // ── Guitar Sample Players ─────────────────────────────────

        /**
         * Carrega todos os samples gravados para um instrumento.
         * Cria Tone.Player para cada um e armazena em _samplePlayers.
         * @param {string} instrument 'guitar' | 'cavaco'
         */
        async loadGuitarSamplers(instrument = 'guitar') {
            try {
                const rows = await window.HMSAPI.GuitarSamples.getAll();
                const filtered = rows.filter(r => r.instrument === instrument);

                // Cria todos os players em paralelo (muito mais rápido que sequencial)
                const loaded = await Promise.all(filtered.map(async row => {
                    const key = `${instrument}|${row.chord_root}${row.chord_quality}`;
                    const url = window.HMSAPI.GuitarSamples.getPublicUrl(row.storage_path);
                    if (!url) return null;
                    if (_samplePlayers.has(key)) {
                        try { _samplePlayers.get(key).dispose(); } catch (_) {}
                    }
                    const player = new Tone.Player(url).toDestination();
                    return { key, player };
                }));

                // Espera todos carregarem de uma vez
                await Tone.loaded();

                for (const item of loaded) {
                    if (item) _samplePlayers.set(item.key, item.player);
                }
                console.info(`[AudioEngine] ${filtered.length} samples carregados para ${instrument}`);
            } catch (err) {
                console.warn('[AudioEngine] loadGuitarSamplers erro:', err.message);
            }
        },

        /**
         * Adiciona/atualiza um único sample player (chamado após nova gravação).
         * @param {string} chordStr   e.g. 'Am', 'C', 'G7'
         * @param {string} instrument 'guitar' | 'cavaco'
         * @param {string} url        URL pública do WAV
         */
        async addGuitarSample(chordStr, instrument, url) {
            try {
                const key = `${instrument}|${chordStr}`;
                if (_samplePlayers.has(key)) {
                    try { _samplePlayers.get(key).dispose(); } catch (_) {}
                }
                const player = new Tone.Player(url);
                await Tone.loaded();
                player.toDestination();
                _samplePlayers.set(key, player);
                console.info(`[AudioEngine] Sample adicionado: ${key}`);
            } catch (err) {
                console.warn('[AudioEngine] addGuitarSample erro:', err.message);
            }
        },

        /**
         * Remove um sample player da memória.
         */
        removeGuitarSample(chordStr, instrument) {
            const key = `${instrument}|${chordStr}`;
            if (_samplePlayers.has(key)) {
                try { _samplePlayers.get(key).dispose(); } catch (_) {}
                _samplePlayers.delete(key);
            }
        },

        /**
         * Verifica se existe sample gravado para este acorde/instrumento.
         */
        hasGuitarSample(chordStr, instrument) {
            return _samplePlayers.has(`${instrument}|${chordStr}`);
        },

        /**
         * Toca o sample de um acorde.
         * Se o sample exato não existir, usa pitch-shifting no sample mais
         * próximo da mesma quality (máx ±6 semitons via Tone.Player.detune).
         *
         * @param {string} chordStr   e.g. 'F#m', 'Bb7', 'C'
         * @param {string} instrument 'guitar' | 'cavaco'
         * @returns {boolean} true se tocou (direto ou transposto), false se sem sample
         */
        playGuitarSample(chordStr, instrument = 'guitar', audioTime = undefined) {
            // Normaliza aliases de quality:
            //   m7(b5) → m7   (notação alternativa para meio-diminuto)
            //   h      → m7   (notação usada no harmony_str: Ch, F#h, etc.)
            //   o / °  → dim  (notação usada no harmony_str: Co, Bo, etc.)
            const normalizedStr = chordStr
                .replace('m7(b5)', 'm7')
                .replace(/([A-Gb#]+)h$/, '$1m7')
                .replace(/([A-Gb#]+)[o°]$/, '$1dim');

            // DEBUG — remover após diagnóstico
            const exactKey0 = `${instrument}|${normalizedStr}`;
            console.debug(`[HMS-DBG] playGuitarSample: raw="${chordStr}" norm="${normalizedStr}" key="${exactKey0}" totalLoaded=${_samplePlayers.size} hasExact=${_samplePlayers.has(exactKey0)}`);
            if (_samplePlayers.size > 0 && !_samplePlayers.has(exactKey0)) {
                console.debug('[HMS-DBG] Chaves carregadas:', [..._samplePlayers.keys()].join(', '));
            }

            // Quando audioTime não é fornecido (clique manual), toca imediatamente
            const when = audioTime !== undefined ? audioTime : Tone.now();

            // 1. Sample exato
            const exactKey    = `${instrument}|${normalizedStr}`;
            const exactPlayer = _samplePlayers.get(exactKey);

            if (exactPlayer) {
                try {
                    exactPlayer.detune = 0;
                    if (exactPlayer.state === 'started') exactPlayer.stop();
                    exactPlayer.start(when);
                    return true;
                } catch (err) {
                    console.warn('[AudioEngine] playGuitarSample (exact) erro:', err.message);
                    return false;
                }
            }

            // 2. Pitch-shift: sample mais próximo da mesma quality
            const nearest = _findNearestSample(normalizedStr, instrument);
            if (!nearest) return false;

            const { player, detuneCents, semitons } = nearest;
            try {
                if (player.state === 'started') player.stop();
                player.detune = detuneCents;
                player.start(when);
                setTimeout(() => { try { player.detune = 0; } catch (_) {} }, 3000);
                console.debug(`[AudioEngine] ${chordStr} transposto ${detuneCents > 0 ? '+' : ''}${semitons}st`);
                return true;
            } catch (err) {
                console.warn('[AudioEngine] playGuitarSample (pitch-shift) erro:', err.message);
                return false;
            }
        },
    };

    window.HMSAudio = AudioEngine;
    console.info('[HMS] AudioEngine loaded.');
})();

