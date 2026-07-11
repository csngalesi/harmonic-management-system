/**
 * HMS — GuitarRecorder
 * Grava samples de acordes via microfone com:
 *   - waitForOnset: detecta início do som via RMS threshold
 *   - record: captura até maxDuration segundos
 *   - process: trim + normalize + fadeIn/Out
 *   - encodeWAV: encoda em WAV PCM16 mono (puro JS, sem libs)
 *
 * Exposto via window.GuitarRecorder
 */
(function () {
    'use strict';

    // ── Constantes ────────────────────────────────────────────────
    const SAMPLE_RATE      = 44100;
    const MAX_DURATION_S   = 4;       // janela máxima de captura
    const TARGET_DURATION_S = 2.0;   // duração fixa do sample após onset (segundos)
    const ONSET_TIMEOUT    = 10000;   // ms esperando o músico tocar
    const RMS_THRESHOLD    = 0.018;   // sensibilidade de onset (0 a 1)
    const ONSET_THRESH     = 0.008;   // RMS para detectar início (onset finder)
    const FADE_IN_MS       = 20;
    const FADE_OUT_MS      = 250;     // fade-out generoso para cauda natural

    let _stream     = null;   // MediaStream ativo
    let _recording  = false;
    let _cancelFn   = null;   // permite cancelar onset wait

    // ── Helpers ───────────────────────────────────────────────────
    function _rms(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        return Math.sqrt(sum / buffer.length);
    }

    // Encontra o índice da primeira janela acima do threshold
    function _findOnsetSample(samples, threshold) {
        const WINDOW = 256;
        for (let i = 0; i < samples.length - WINDOW; i += WINDOW) {
            let sum = 0;
            for (let j = i; j < i + WINDOW; j++) sum += samples[j] * samples[j];
            if (Math.sqrt(sum / WINDOW) > threshold) return i;
        }
        return 0;
    }

    // ── WAV Encoder (puro JS) ─────────────────────────────────────
    function _encodeWAV(samples, sampleRate) {
        const numSamples  = samples.length;
        const buffer      = new ArrayBuffer(44 + numSamples * 2);
        const view        = new DataView(buffer);

        function writeStr(offset, str) {
            for (let i = 0; i < str.length; i++)
                view.setUint8(offset + i, str.charCodeAt(i));
        }

        // RIFF header
        writeStr(0,  'RIFF');
        view.setUint32(4,  36 + numSamples * 2, true);
        writeStr(8,  'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);           // chunk size
        view.setUint16(20, 1,  true);           // PCM = 1
        view.setUint16(22, 1,  true);           // mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true); // byte rate
        view.setUint16(32, 2,  true);           // block align
        view.setUint16(34, 16, true);           // bits per sample
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        // PCM16 samples
        for (let i = 0; i < numSamples; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    // ── Processamento ─────────────────────────────────────────────
    function _process(rawSamples) {
        // 1. Detecta onset e captura janela FIXA de TARGET_DURATION_S
        //    → duração consistente independente do decaimento da corda
        const onset      = _findOnsetSample(rawSamples, ONSET_THRESH);
        const targetLen  = Math.round(SAMPLE_RATE * TARGET_DURATION_S);
        const end        = Math.min(onset + targetLen, rawSamples.length);
        let   samples    = rawSamples.slice(onset, end);

        if (samples.length === 0) samples = rawSamples.slice(0, targetLen);

        // 2. Normalize (peak = 0.95)
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
        }
        if (peak > 0.001) {
            const gain = 0.95 / peak;
            samples = samples.map(s => s * gain);
        }

        // 3. Fade in (20ms — evita clique no ataque)
        const fadeInSamples  = Math.round(SAMPLE_RATE * FADE_IN_MS  / 1000);
        for (let i = 0; i < fadeInSamples && i < samples.length; i++) {
            samples[i] *= i / fadeInSamples;
        }

        // 4. Fade out (250ms — cauda natural, sem corte abrupto)
        const fadeOutSamples = Math.round(SAMPLE_RATE * FADE_OUT_MS / 1000);
        for (let i = 0; i < fadeOutSamples && i < samples.length; i++) {
            const idx = samples.length - 1 - i;
            samples[idx] *= i / fadeOutSamples;
        }

        const durationMs = Math.round(samples.length / SAMPLE_RATE * 1000);
        const blob = _encodeWAV(samples, SAMPLE_RATE);

        return { blob, durationMs };
    }

    // ── Captura via MediaRecorder + OfflineAudioContext ───────────
    async function _captureRaw(stream, maxSeconds) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            const mr = new MediaRecorder(stream, { mimeType: _pickMime() });

            mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            mr.onerror = e => reject(e.error);

            mr.onstop = async () => {
                try {
                    const blob = new Blob(chunks, { type: mr.mimeType });
                    const arrayBuffer = await blob.arrayBuffer();
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
                    const decoded  = await audioCtx.decodeAudioData(arrayBuffer);
                    audioCtx.close();

                    // Mescla todos os canais em mono
                    const numCh = decoded.numberOfChannels;
                    const len   = decoded.length;
                    const mono  = new Float32Array(len);
                    for (let ch = 0; ch < numCh; ch++) {
                        const ch_data = decoded.getChannelData(ch);
                        for (let i = 0; i < len; i++) mono[i] += ch_data[i];
                    }
                    if (numCh > 1) for (let i = 0; i < len; i++) mono[i] /= numCh;

                    resolve(mono);
                } catch (err) {
                    reject(err);
                }
            };

            mr.start(100); // coleta chunks de 100ms

            const timer = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, maxSeconds * 1000);
            _cancelFn = () => { clearTimeout(timer); if (mr.state === 'recording') mr.stop(); };
        });
    }

    function _pickMime() {
        const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        return preferred.find(m => MediaRecorder.isTypeSupported(m)) || '';
    }

    // ── Onset detection ───────────────────────────────────────────
    function _waitForOnset(stream, onProgress) {
        return new Promise((resolve, reject) => {
            const audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
            const source    = audioCtx.createMediaStreamSource(stream);
            const analyser  = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            const buf     = new Float32Array(analyser.fftSize);
            const started = Date.now();
            let   raf     = null;

            const check = () => {
                const elapsed = Date.now() - started;
                if (elapsed > ONSET_TIMEOUT) {
                    audioCtx.close();
                    reject(new Error('timeout'));
                    return;
                }

                analyser.getFloatTimeDomainData(buf);
                const level = _rms(buf);

                if (onProgress) onProgress(level);

                if (level >= RMS_THRESHOLD) {
                    audioCtx.close();
                    resolve();
                    return;
                }
                raf = requestAnimationFrame(check);
            };

            raf = requestAnimationFrame(check);

            // Permite cancelar de fora
            _cancelFn = () => {
                cancelAnimationFrame(raf);
                audioCtx.close();
                reject(new Error('cancelled'));
            };
        });
    }

    // ── API Pública ───────────────────────────────────────────────
    const GuitarRecorder = {

        get isRecording() { return _recording; },

        /**
         * Pipeline completo: pede microfone → espera onset → grava → processa
         *
         * @param {object} opts
         * @param {function} opts.onWaiting    - chamado enquanto espera onset (level: 0–1)
         * @param {function} opts.onRecording  - chamado quando início detectado
         * @param {function} opts.onProgress   - chamado a cada 100ms com { elapsed, total }
         * @returns {Promise<{blob: Blob, durationMs: number}>}
         */
        async start({ onWaiting, onRecording, onProgress } = {}) {
            if (_recording) throw new Error('Já gravando');
            _recording = true;

            try {
                // 1. Pede acesso ao microfone
                _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

                // 2. Espera onset
                if (onWaiting) {
                    await _waitForOnset(_stream, level => onWaiting(level));
                } else {
                    await _waitForOnset(_stream);
                }

                // 3. Notifica início
                if (onRecording) onRecording();

                // 4. Grava com progresso
                let elapsed = 0;
                let progressTimer = null;
                if (onProgress) {
                    progressTimer = setInterval(() => {
                        elapsed += 100;
                        onProgress({ elapsed, total: MAX_DURATION_S * 1000 });
                    }, 100);
                }

                const rawSamples = await _captureRaw(_stream, MAX_DURATION_S);

                if (progressTimer) clearInterval(progressTimer);

                // 5. Processa
                const result = _process(rawSamples);
                return result;

            } finally {
                _recording = false;
                _cancelFn  = null;
                if (_stream) {
                    _stream.getTracks().forEach(t => t.stop());
                    _stream = null;
                }
            }
        },

        /** Cancela gravação ou espera de onset */
        cancel() {
            if (_cancelFn) {
                _cancelFn();
                _cancelFn = null;
            }
            _recording = false;
            if (_stream) {
                _stream.getTracks().forEach(t => t.stop());
                _stream = null;
            }
        },
    };

    window.GuitarRecorder = GuitarRecorder;
    console.info('[HMS] GuitarRecorder loaded.');
})();
