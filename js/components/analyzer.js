/**
 * HMS — Analisador Reverso Component (Módulo 2)
 * Input: raw chords + key → Output: HMS degree string.
 * Exposed via window.AnalyzerComponent
 */
(function () {
    'use strict';

    const KEYS = window.HarmonyEngine.allKeys();
    const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    let _lastResult = '';
    let _isPlaying  = false;

    const AnalyzerComponent = {

        render: function () {
            const content = document.getElementById('main-content');
            const keyOptions = KEYS.map(k =>
                `<option value="${k.value}">${k.label}</option>`
            ).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-magnifying-glass-chart"></i></div>
                        <div>
                            <h2>Analisador Reverso</h2>
                            <p>Converta acordes brutos em graus funcionais HMS</p>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;" class="analyzer-grid">

                    <!-- Input Panel -->
                    <div class="panel">
                        <div class="panel-header">
                            <span class="panel-title"><i class="fa-solid fa-keyboard"></i> Entrada</span>
                        </div>
                        <div class="panel-body">
                            <div class="form-group">
                                <label class="form-label">Tom da música</label>
                                <select id="analyzer-key" class="form-input form-select">${keyOptions}</select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Acordes (separados por espaço ou traço)</label>
                                <textarea id="analyzer-chords" class="form-input" rows="4"
                                    placeholder="Ex: C Am Bm7(b5) E7 Am&#10;ou&#10;C - Am - G7 - F"></textarea>
                                <span class="form-hint">Use nomes de acorde padrão: C, Am, Dm7, G7, Bm7(b5), E°…</span>
                            </div>
                            <button class="btn btn-primary btn-full" id="btn-analyze">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Analisar
                            </button>
                        </div>
                    </div>

                    <!-- Output Panel -->
                    <div class="panel">
                        <div class="panel-header">
                            <span class="panel-title"><i class="fa-solid fa-output"></i> Graus Funcionais</span>
                            <div style="display:flex;gap:6px;">
                                <button class="btn btn-primary btn-sm" id="btn-play-degrees" title="Executar" disabled>
                                    <i class="fa-solid fa-play"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" id="btn-copy-degrees" title="Copiar">
                                    <i class="fa-solid fa-copy"></i> Copiar
                                </button>
                            </div>
                        </div>
                        <div class="panel-body">
                            <div class="degree-output" id="degree-output" style="min-height:120px;">
                                <span style="color:var(--text-muted);font-size:.875rem;">
                                    Resultado aparecerá aqui…
                                </span>
                            </div>
                            <div id="degree-verify" style="margin-top:16px;"></div>
                        </div>
                    </div>

                </div>

                <!-- Save to Repertoire -->
                <div class="panel" style="margin-top:20px;" id="save-panel">
                    <div class="panel-header">
                        <span class="panel-title"><i class="fa-solid fa-floppy-disk"></i> Salvar no Repertório</span>
                    </div>
                    <div class="panel-body">
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label">Título *</label>
                                <input type="text" id="save-title" class="form-input" placeholder="Nome da música" />
                            </div>
                            <div class="form-group">
                                <label class="form-label">Artista</label>
                                <input type="text" id="save-artist" class="form-input" placeholder="Intérprete" />
                            </div>
                        </div>
                        <button class="btn btn-secondary" id="btn-save-song">
                            <i class="fa-solid fa-plus"></i> Adicionar ao Repertório
                        </button>
                    </div>
                </div>
            `;

            // Make grid responsive
            const grid = content.querySelector('.analyzer-grid');
            if (window.innerWidth <= 768) {
                grid.style.gridTemplateColumns = '1fr';
            }

            document.getElementById('btn-analyze').addEventListener('click', () => {
                AnalyzerComponent._handleAnalyze();
            });

            document.getElementById('btn-play-degrees').addEventListener('click', () => {
                AnalyzerComponent._handlePlay();
            });

            document.getElementById('btn-copy-degrees').addEventListener('click', () => {
                if (!_lastResult) return;
                navigator.clipboard.writeText(_lastResult).then(() => {
                    window.HMSApp.showToast('Copiado!', 'success');
                });
            });

            document.getElementById('btn-save-song').addEventListener('click', () => {
                AnalyzerComponent._handleSaveToRepertoire();
            });
        },

        _handleAnalyze: function () {
            const chordsStr = (document.getElementById('analyzer-chords').value || '').trim();
            const keyVal    = document.getElementById('analyzer-key').value;

            if (!chordsStr) {
                window.HMSApp.showToast('Informe os acordes para analisar.', 'warning');
                return;
            }

            const kObj    = KEYS.find(k => k.value === keyVal) || KEYS[0];
            const root    = kObj.value.replace(/m$/, '');
            const isMinor = kObj.isMinor;

            const degrees = window.HarmonyEngine.analyze(chordsStr, root, isMinor);
            _lastResult   = degrees;

            const outputEl = document.getElementById('degree-output');
            outputEl.textContent = degrees || '(sem resultado)';

            const playBtn = document.getElementById('btn-play-degrees');
            if (playBtn) playBtn.disabled = !degrees;

            // Verify by re-translating the degrees
            if (degrees) {
                const backTokens = window.HarmonyEngine.translate(degrees, root, isMinor);
                const backChords = backTokens
                    .filter(t => t.type === 'CHORD')
                    .map(t => t.value)
                    .join(' ');

                document.getElementById('degree-verify').innerHTML = `
                    <div class="panel" style="background:var(--bg-deep);">
                        <div class="panel-header" style="padding:8px 14px;">
                            <span style="font-size:.78rem;color:var(--text-muted);">
                                <i class="fa-solid fa-rotate"></i> Verificação (graus → acordes em ${esc(keyVal)})
                            </span>
                        </div>
                        <div style="padding:10px 14px;font-family:var(--font-mono);font-size:1rem;color:var(--chord-blue);">
                            ${esc(backChords)}
                        </div>
                    </div>
                `;

                // Pre-fill the save panel with the key
                const keySelect = document.getElementById('analyzer-key');
                if (keySelect) keySelect.value = keyVal;
            }
        },

        _handlePlay: function () {
            const playBtn = document.getElementById('btn-play-degrees');

            if (_isPlaying) {
                window.HMSAudio.stop();
                _isPlaying = false;
                if (playBtn) {
                    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                    playBtn.className = 'btn btn-primary btn-sm';
                }
                return;
            }

            if (!_lastResult) return;

            const keyVal  = document.getElementById('analyzer-key').value;
            const kObj    = KEYS.find(k => k.value === keyVal) || KEYS[0];
            const root    = kObj.value.replace(/m$/, '');
            const isMinor = kObj.isMinor;

            const tokens = window.HarmonyEngine.translate(_lastResult, root, isMinor);
            _isPlaying = true;

            if (playBtn) {
                playBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
                playBtn.className = 'btn btn-secondary btn-sm';
            }

            window.HMSAudio.playSequence(tokens, 80, () => {
                _isPlaying = false;
                if (playBtn) {
                    playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                    playBtn.className = 'btn btn-primary btn-sm';
                }
            });
        },

        _handleSaveToRepertoire: async function () {
            if (!_lastResult) {
                window.HMSApp.showToast('Analise uma progressão antes de salvar.', 'warning');
                return;
            }

            const title  = (document.getElementById('save-title').value  || '').trim();
            const artist = (document.getElementById('save-artist').value || '').trim();
            const keyVal = document.getElementById('analyzer-key').value;

            if (!title) {
                window.HMSApp.showToast('Informe o título da música.', 'warning');
                document.getElementById('save-title').focus();
                return;
            }

            const saveBtn = document.getElementById('btn-save-song');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="btn-spinner"></span> Salvando…';

            try {
                await window.HMSAPI.Songs.create({
                    title,
                    artist:      artist || null,
                    original_key: keyVal,
                    harmony_str: _lastResult,
                });
                window.HMSApp.showToast(`"${title}" adicionada ao Repertório!`, 'success');
                document.getElementById('save-title').value  = '';
                document.getElementById('save-artist').value = '';
            } catch (err) {
                window.HMSApp.showToast('Erro ao salvar: ' + err.message, 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar ao Repertório';
            }
        },
    };

    window.AnalyzerComponent = AnalyzerComponent;
    console.info('[HMS] AnalyzerComponent loaded.');
})();
