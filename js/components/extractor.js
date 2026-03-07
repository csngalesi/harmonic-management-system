/**
 * HMS — Extrator de Áudio Component (Módulo 3)
 * Chord detection via Web Audio API + chromagram + template matching.
 *  - FFT size 8192 → ~5.4 Hz/bin resolution, good for chord tones ≥ C2
 *  - Chromagram: collapse all octaves into 12 pitch-class energy bins
 *  - Template matching: triads (major, minor, dim, sus) + tetrads (7, m7, M7, h)
 *    so the V7 chord is correctly detected as a tetrad, not a triad.
 * Exposed via window.ExtractorComponent
 */
(function () {
    'use strict';

    const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const KEYS      = window.HarmonyEngine.allKeys();
    const esc       = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Chord templates: root = 0, intervals in semitones
    const CHORD_TEMPLATES = [
        { q: '',     iv: [0, 4, 7]        },  // major triad
        { q: 'm',    iv: [0, 3, 7]        },  // minor triad
        { q: '7',    iv: [0, 4, 7, 10]    },  // dominant 7th  (tetrad — V7)
        { q: 'm7',   iv: [0, 3, 7, 10]    },  // minor 7th
        { q: 'M7',   iv: [0, 4, 7, 11]    },  // major 7th
        { q: 'h',    iv: [0, 3, 6, 10]    },  // half-diminished (m7b5)
        { q: 'dim',  iv: [0, 3, 6]        },  // diminished triad
        { q: 'sus4', iv: [0, 5, 7]        },  // sus4
        { q: 'sus2', iv: [0, 2, 7]        },  // sus2
    ];

    let _state = {
        audioCtx:        null,
        analyser:        null,
        micStream:       null,
        sourceNode:      null,
        animFrame:       null,
        isRecording:     false,
        detectedChord:   '—',
        capturedChords:  [],
        lastCaptureTime: 0,
        captureInterval: 1500,
    };

    const ExtractorComponent = {

        render: function () {
            const content = document.getElementById('main-content');
            const keyOptions = KEYS.map(k =>
                `<option value="${k.value}">${k.label}</option>`
            ).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-microphone-lines"></i></div>
                        <div>
                            <h2>Extrator de Áudio</h2>
                            <p>Tire de ouvido e gere um draft de harmonia</p>
                        </div>
                    </div>
                </div>

                <!-- Configuração -->
                <div class="panel mb-3">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-sliders"></i> Configuração</span>
                    </div>
                    <div class="panel-body">
                        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
                            <div class="form-group" style="margin:0;flex:0 0 auto;">
                                <label class="form-label">Tom de Referência</label>
                                <select id="ext-key" class="form-input form-select" style="width:160px;">${keyOptions}</select>
                            </div>
                            <div class="form-group" style="margin:0;flex:0 0 auto;">
                                <label class="form-label">Captura automática a cada</label>
                                <select id="ext-interval" class="form-input form-select" style="width:130px;">
                                    <option value="1000">1 segundo</option>
                                    <option value="1500" selected>1,5 segundos</option>
                                    <option value="2000">2 segundos</option>
                                    <option value="3000">3 segundos</option>
                                    <option value="0">Manual</option>
                                </select>
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="btn btn-primary" id="btn-start-mic">
                                    <i class="fa-solid fa-microphone"></i> Ligar Microfone
                                </button>
                                <button class="btn btn-danger hidden" id="btn-stop-mic">
                                    <i class="fa-solid fa-stop"></i> Parar
                                </button>
                                <label class="btn btn-secondary" style="cursor:pointer;">
                                    <i class="fa-solid fa-file-audio"></i> Carregar MP3
                                    <input type="file" id="file-input" accept="audio/*" style="display:none;" />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Visualizer + acorde detectado -->
                <div style="display:grid;grid-template-columns:1fr 200px;gap:16px;margin-bottom:20px;" id="viz-grid">
                    <div class="audio-panel">
                        <canvas id="audio-canvas" height="120"></canvas>
                    </div>
                    <div class="panel" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
                        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Acorde Detectado</div>
                        <div class="detected-chord" id="detected-note">—</div>
                        <div id="chord-confidence" style="font-size:.7rem;color:var(--text-muted);min-height:1em;"></div>
                        <button class="btn btn-secondary btn-sm" id="btn-capture-manual">
                            <i class="fa-solid fa-hand-pointer"></i> Capturar
                        </button>
                    </div>
                </div>

                <!-- Acordes capturados -->
                <div class="panel mb-3">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-list"></i> Acordes Capturados</span>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-secondary btn-sm" id="btn-undo-capture">
                                <i class="fa-solid fa-rotate-left"></i> Desfazer
                            </button>
                            <button class="btn btn-secondary btn-sm" id="btn-clear-captures">
                                <i class="fa-solid fa-trash"></i> Limpar
                            </button>
                        </div>
                    </div>
                    <div class="panel-body">
                        <div id="captured-list" class="chord-grid">
                            <span style="color:var(--text-muted);font-size:.875rem;">
                                Aguardando captura…
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Draft + analisar -->
                <div class="panel">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Draft de Harmonia</span>
                        <button class="btn btn-primary btn-sm" id="btn-analyze-draft">
                            <i class="fa-solid fa-magnifying-glass-chart"></i> Analisar
                        </button>
                    </div>
                    <div class="panel-body">
                        <div class="form-group">
                            <label class="form-label">Acordes capturados (editável)</label>
                            <textarea id="draft-chords" class="form-input" rows="3"
                                placeholder="Acordes aparecerão aqui após a captura…"></textarea>
                        </div>
                        <div id="draft-result" style="margin-top:12px;"></div>
                    </div>
                </div>
            `;

            if (window.innerWidth <= 768) {
                document.getElementById('viz-grid').style.gridTemplateColumns = '1fr';
            }

            ExtractorComponent._bindEvents();
        },

        _bindEvents: function () {
            document.getElementById('btn-start-mic').addEventListener('click', () => {
                ExtractorComponent._startMic();
            });
            document.getElementById('btn-stop-mic').addEventListener('click', () => {
                ExtractorComponent._stopAudio();
            });
            document.getElementById('file-input').addEventListener('change', (e) => {
                if (e.target.files[0]) ExtractorComponent._loadFile(e.target.files[0]);
            });
            document.getElementById('btn-capture-manual').addEventListener('click', () => {
                ExtractorComponent._captureCurrentChord();
            });
            document.getElementById('btn-undo-capture').addEventListener('click', () => {
                _state.capturedChords.pop();
                ExtractorComponent._updateCapturedList();
            });
            document.getElementById('btn-clear-captures').addEventListener('click', () => {
                if (!_state.capturedChords.length || confirm('Limpar todos os acordes capturados?')) {
                    _state.capturedChords = [];
                    ExtractorComponent._updateCapturedList();
                }
            });
            document.getElementById('ext-interval').addEventListener('change', (e) => {
                _state.captureInterval = parseInt(e.target.value, 10);
            });
            document.getElementById('btn-analyze-draft').addEventListener('click', () => {
                ExtractorComponent._analyzeDraft();
            });
        },

        // ── Microphone ────────────────────────────────────────────
        _startMic: async function () {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                _state.micStream = stream;
                ExtractorComponent._setupAudioContext(stream);
                _state.isRecording = true;
                document.getElementById('btn-start-mic').classList.add('hidden');
                document.getElementById('btn-stop-mic').classList.remove('hidden');
                window.HMSApp.showToast('Microfone ativado.', 'success');
            } catch (err) {
                window.HMSApp.showToast('Erro ao acessar microfone: ' + err.message, 'error');
            }
        },

        _loadFile: function (file) {
            ExtractorComponent._stopAudio();
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const ctx    = new AudioContext();
                    _state.audioCtx = ctx;
                    const buffer = await ctx.decodeAudioData(e.target.result);
                    const source = ctx.createBufferSource();
                    source.buffer = buffer;

                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 8192;
                    source.connect(analyser);
                    analyser.connect(ctx.destination);
                    source.start(0);

                    _state.analyser   = analyser;
                    _state.sourceNode = source;
                    _state.isRecording = true;

                    ExtractorComponent._startDraw();
                    window.HMSApp.showToast('Arquivo de áudio carregado.', 'success');
                    source.onended = () => ExtractorComponent._stopAudio();
                } catch (err) {
                    window.HMSApp.showToast('Erro ao processar áudio: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        },

        _setupAudioContext: function (stream) {
            const ctx      = new AudioContext();
            const source   = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 8192;  // better frequency resolution for chord detection
            source.connect(analyser);

            _state.audioCtx   = ctx;
            _state.analyser   = analyser;
            _state.sourceNode = source;

            ExtractorComponent._startDraw();
        },

        _stopAudio: function () {
            _state.isRecording = false;
            if (_state.animFrame)  { cancelAnimationFrame(_state.animFrame); _state.animFrame = null; }
            if (_state.micStream)  { _state.micStream.getTracks().forEach(t => t.stop()); _state.micStream = null; }
            if (_state.sourceNode) { try { _state.sourceNode.stop(); } catch (_) {} _state.sourceNode = null; }
            if (_state.audioCtx)   { _state.audioCtx.close(); _state.audioCtx = null; }
            _state.analyser = null;

            const startBtn = document.getElementById('btn-start-mic');
            const stopBtn  = document.getElementById('btn-stop-mic');
            if (startBtn) startBtn.classList.remove('hidden');
            if (stopBtn)  stopBtn.classList.add('hidden');

            const canvas = document.getElementById('audio-canvas');
            if (canvas) {
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            }
        },

        // ── Waveform + Chord Detection Loop ───────────────────────
        _startDraw: function () {
            const canvas = document.getElementById('audio-canvas');
            if (!canvas) return;
            const ctx2d    = canvas.getContext('2d');
            const fftSize  = _state.analyser.fftSize;
            const timeData = new Float32Array(fftSize);
            const freqData = new Float32Array(_state.analyser.frequencyBinCount);

            function draw() {
                _state.animFrame = requestAnimationFrame(draw);

                // ── Waveform (time domain) ──
                _state.analyser.getFloatTimeDomainData(timeData);
                canvas.width = canvas.offsetWidth;
                const W = canvas.width, H = canvas.height;
                ctx2d.fillStyle = '#080a10';
                ctx2d.fillRect(0, 0, W, H);
                ctx2d.lineWidth   = 1.5;
                ctx2d.strokeStyle = '#4ade80';
                ctx2d.beginPath();
                const sliceW = W / fftSize;
                let x = 0;
                for (let i = 0; i < fftSize; i++) {
                    const y = (timeData[i] / 2 + 0.5) * H;
                    i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
                    x += sliceW;
                }
                ctx2d.stroke();

                // ── Chord detection (frequency domain) ──
                _state.analyser.getFloatFrequencyData(freqData);
                const result = ExtractorComponent._detectChord(freqData, _state.audioCtx.sampleRate);

                const chordName = result ? result.name : '—';
                _state.detectedChord = chordName;

                const noteEl = document.getElementById('detected-note');
                if (noteEl) noteEl.textContent = chordName;

                const confEl = document.getElementById('chord-confidence');
                if (confEl) confEl.textContent = result ? `confiança: ${Math.round(result.score * 100)}%` : '';

                // Auto-capture
                if (_state.captureInterval > 0 && result) {
                    const now = Date.now();
                    if (now - _state.lastCaptureTime > _state.captureInterval) {
                        _state.lastCaptureTime = now;
                        ExtractorComponent._captureCurrentChord();
                    }
                }
            }
            draw();
        },

        // ── Chromagram ────────────────────────────────────────────
        // Sums FFT bin energy into 12 pitch-class buckets (all octaves collapsed).
        // freqData: Float32Array in dBFS from analyser.getFloatFrequencyData()
        _computeChroma: function (freqData, sampleRate) {
            const chroma = new Float32Array(12).fill(0);
            const binHz  = sampleRate / (_state.analyser.fftSize);

            for (let i = 2; i < freqData.length; i++) {
                const freq = i * binHz;
                if (freq < 65 || freq > 2000) continue;  // C2–C7 range
                const db = freqData[i];
                if (db < -70) continue;                   // ignore noise floor
                const energy = Math.pow(10, db / 20);
                const midi   = 12 * Math.log2(freq / 440) + 69;
                const pc     = ((Math.round(midi) % 12) + 12) % 12;
                chroma[pc]  += energy;
            }
            return chroma;
        },

        // ── Template Matching ─────────────────────────────────────
        // Returns { name, root, quality, score } or null if below confidence.
        _detectChord: function (freqData, sampleRate) {
            const chroma = ExtractorComponent._computeChroma(freqData, sampleRate);
            const maxVal = Math.max(...chroma);
            if (maxVal < 0.005) return null;  // signal too weak

            // Normalize
            const norm = Array.from(chroma).map(v => v / maxVal);

            // Score each root × quality combination
            // score = (sum of energy at chord tones) / chordSize - penalty for non-tones
            const PENALTY = 0.3;
            const THRESHOLD = 0.38;  // minimum score to declare a detection

            let best = null;

            for (let root = 0; root < 12; root++) {
                for (const tmpl of CHORD_TEMPLATES) {
                    const tones = new Set(tmpl.iv.map(i => (root + i) % 12));
                    let score = 0;
                    for (let pc = 0; pc < 12; pc++) {
                        score += tones.has(pc) ? norm[pc] : -norm[pc] * PENALTY;
                    }
                    score /= tmpl.iv.length;

                    if (score > THRESHOLD && (!best || score > best.score)) {
                        best = {
                            name:    CHROMATIC[root] + tmpl.q,
                            root,
                            quality: tmpl.q,
                            score,
                        };
                    }
                }
            }

            return best;
        },

        // ── Chord Capture ─────────────────────────────────────────
        _captureCurrentChord: function () {
            const chord = _state.detectedChord;
            if (!chord || chord === '—') return;
            _state.capturedChords.push(chord);
            ExtractorComponent._updateCapturedList();
        },

        _updateCapturedList: function () {
            const el = document.getElementById('captured-list');
            if (!el) return;

            if (_state.capturedChords.length === 0) {
                el.innerHTML = '<span style="color:var(--text-muted);font-size:.875rem;">Aguardando captura…</span>';
                const draftEl = document.getElementById('draft-chords');
                if (draftEl) draftEl.value = '';
                return;
            }

            el.innerHTML = _state.capturedChords.map((n, i) =>
                `<div class="chord-cell ${i === _state.capturedChords.length - 1 ? 'chord-highlight' : ''}">${esc(n)}</div>`
            ).join('');

            const draftEl = document.getElementById('draft-chords');
            if (draftEl) draftEl.value = _state.capturedChords.join(' ');
        },

        // ── Draft Analysis ────────────────────────────────────────
        _analyzeDraft: function () {
            const chordsStr = (document.getElementById('draft-chords').value || '').trim();
            const keyVal    = document.getElementById('ext-key').value;

            if (!chordsStr) {
                window.HMSApp.showToast('Capture alguns acordes primeiro.', 'warning');
                return;
            }

            const kObj    = KEYS.find(k => k.value === keyVal) || KEYS[0];
            const root    = kObj.value.replace(/m$/, '');
            const isMinor = kObj.isMinor;

            const degrees = window.HarmonyEngine.analyze(chordsStr, root, isMinor);

            const resultEl = document.getElementById('draft-result');
            resultEl.innerHTML = `
                <div class="panel" style="background:var(--bg-deep);">
                    <div class="panel-header" style="padding:10px 14px;">
                        <span class="panel-title" style="font-size:.85rem;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Graus funcionais (tom: ${esc(keyVal)})
                        </span>
                        <button class="btn btn-primary btn-sm" id="btn-go-analyzer">
                            <i class="fa-solid fa-arrow-right"></i> Refinar no Analisador
                        </button>
                    </div>
                    <div style="padding:12px 14px;font-family:var(--font-mono);font-size:1.3rem;color:var(--chord-amber);word-break:break-all;">
                        ${esc(degrees)}
                    </div>
                </div>
            `;

            document.getElementById('btn-go-analyzer').addEventListener('click', () => {
                window.HMSApp.navigate('analyzer');
                setTimeout(() => {
                    const ca = document.getElementById('analyzer-chords');
                    const ka = document.getElementById('analyzer-key');
                    if (ca) ca.value = chordsStr;
                    if (ka) ka.value = keyVal;
                }, 100);
            });
        },
    };

    window.ExtractorComponent = ExtractorComponent;
    console.info('[HMS] ExtractorComponent loaded.');
})();
