/**
 * HMS — Extrator de Áudio Component (Módulo 3)
 * Pitch detection via Web Audio API + autocorrelation algorithm.
 * Generates a draft chord progression to be edited and saved.
 * Exposed via window.ExtractorComponent
 */
(function () {
    'use strict';

    const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const KEYS      = window.HarmonyEngine.allKeys();
    const esc       = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    let _state = {
        audioCtx:     null,
        analyser:     null,
        micStream:    null,
        sourceNode:   null,
        animFrame:    null,
        isRecording:  false,
        detectedNote: '—',
        capturedChords: [],
        lastCaptureTime: 0,
        captureInterval: 1500, // ms between auto-captures
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

                <!-- Audio source selection -->
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

                <!-- Visualizer + detected note -->
                <div style="display:grid;grid-template-columns:1fr 200px;gap:16px;margin-bottom:20px;" id="viz-grid">
                    <div class="audio-panel">
                        <canvas id="audio-canvas" height="120"></canvas>
                    </div>
                    <div class="panel" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
                        <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--text-muted);">Nota Detectada</div>
                        <div class="detected-chord" id="detected-note">—</div>
                        <button class="btn btn-secondary btn-sm" id="btn-capture-manual">
                            <i class="fa-solid fa-hand-pointer"></i> Capturar
                        </button>
                    </div>
                </div>

                <!-- Captured chord list -->
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

                <!-- Draft output + save -->
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

            // Make viz grid responsive
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
                ExtractorComponent._captureCurrentNote();
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
                    const ctx     = new AudioContext();
                    _state.audioCtx = ctx;
                    const buffer  = await ctx.decodeAudioData(e.target.result);
                    const source  = ctx.createBufferSource();
                    source.buffer = buffer;

                    const analyser = ctx.createAnalyser();
                    analyser.fftSize = 2048;
                    source.connect(analyser);
                    analyser.connect(ctx.destination);
                    source.start(0);

                    _state.analyser   = analyser;
                    _state.sourceNode = source;
                    _state.isRecording = true;

                    ExtractorComponent._startDraw();
                    ExtractorComponent._startAutoCapture();
                    window.HMSApp.showToast('Arquivo de áudio carregado.', 'success');

                    source.onended = () => ExtractorComponent._stopAudio();
                } catch (err) {
                    window.HMSApp.showToast('Erro ao processar áudio: ' + err.message, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        },

        _setupAudioContext: function (stream) {
            const ctx     = new AudioContext();
            const source  = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);

            _state.audioCtx   = ctx;
            _state.analyser   = analyser;
            _state.sourceNode = source;

            ExtractorComponent._startDraw();
            ExtractorComponent._startAutoCapture();
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

            // Clear canvas
            const canvas = document.getElementById('audio-canvas');
            if (canvas) {
                const ctx2d = canvas.getContext('2d');
                ctx2d.clearRect(0, 0, canvas.width, canvas.height);
            }
        },

        // ── Waveform Drawing ──────────────────────────────────────
        _startDraw: function () {
            const canvas  = document.getElementById('audio-canvas');
            if (!canvas) return;
            const ctx2d   = canvas.getContext('2d');
            const bufLen  = _state.analyser.fftSize;
            const dataArr = new Float32Array(bufLen);

            function draw() {
                _state.animFrame = requestAnimationFrame(draw);
                _state.analyser.getFloatTimeDomainData(dataArr);

                canvas.width = canvas.offsetWidth;
                const W = canvas.width, H = canvas.height;

                ctx2d.fillStyle = '#080a10';
                ctx2d.fillRect(0, 0, W, H);

                ctx2d.lineWidth   = 1.5;
                ctx2d.strokeStyle = '#4ade80';
                ctx2d.beginPath();

                const sliceW = W / bufLen;
                let x = 0;
                for (let i = 0; i < bufLen; i++) {
                    const y = (dataArr[i] / 2 + 0.5) * H;
                    i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
                    x += sliceW;
                }
                ctx2d.stroke();

                // Pitch detection
                const pitch = ExtractorComponent._detectPitch(dataArr, _state.audioCtx.sampleRate);
                const note  = pitch > 0 ? ExtractorComponent._frequencyToNote(pitch) : '—';
                _state.detectedNote = note;

                const noteEl = document.getElementById('detected-note');
                if (noteEl) noteEl.textContent = note;

                // Auto-capture
                if (_state.captureInterval > 0 && pitch > 0) {
                    const now = Date.now();
                    if (now - _state.lastCaptureTime > _state.captureInterval) {
                        _state.lastCaptureTime = now;
                        ExtractorComponent._captureCurrentNote();
                    }
                }
            }
            draw();
        },

        _startAutoCapture: function () {
            // Auto-capture is handled inside _startDraw's loop
        },

        // ── Autocorrelation Pitch Detection ───────────────────────
        _detectPitch: function (buf, sampleRate) {
            const SIZE = buf.length;
            let rms = 0;
            for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
            rms = Math.sqrt(rms / SIZE);
            if (rms < 0.01) return -1; // too quiet

            let r1 = 0, r2 = SIZE - 1;
            const thres = 0.2;
            for (let i = 0; i < SIZE / 2; i++) {
                if (Math.abs(buf[i]) < thres) { r1 = i; break; }
            }
            for (let i = 1; i < SIZE / 2; i++) {
                if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
            }
            const buf2 = buf.slice(r1, r2);
            const c    = new Float32Array(buf2.length).fill(0);

            for (let i = 0; i < buf2.length; i++) {
                for (let j = 0; j < buf2.length - i; j++) {
                    c[i] += buf2[j] * buf2[j + i];
                }
            }

            let d = 0;
            while (c[d] > c[d + 1]) d++;
            let maxVal = -Infinity, maxPos = -1;
            for (let i = d; i < buf2.length; i++) {
                if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
            }
            if (maxPos === -1) return -1;

            // Parabolic interpolation
            const x1 = c[maxPos - 1] ?? c[maxPos];
            const x2 = c[maxPos];
            const x3 = c[maxPos + 1] ?? c[maxPos];
            const a  = (x1 + x3 - 2 * x2) / 2;
            const b  = (x3 - x1) / 2;
            const shift = a ? -b / (2 * a) : 0;

            return sampleRate / (maxPos + shift);
        },

        _frequencyToNote: function (freq) {
            const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
            const idx     = (Math.round(noteNum) + 69 + 1200) % 12;
            return CHROMATIC[idx];
        },

        // ── Chord Capture ─────────────────────────────────────────
        _captureCurrentNote: function () {
            const note = _state.detectedNote;
            if (!note || note === '—') return;
            _state.capturedChords.push(note);
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
                // Pre-fill analyzer after navigation
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
