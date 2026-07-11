/**
 * HMS — GuitarSampler Component
 * Tela de gravação de samples de acordes.
 *
 * Grid 7×5 por instrumento:
 *   7 roots:     C  D  E  F  G  A  B
 *   5 qualities: Maior / Menor / Dom7 / m7 / Dim
 * Dois tabs: 🎸 Violão  /  🪗 Cavaco  → 70 slots no total
 *
 * 3 estados por célula:
 *   empty     — clique para gravar
 *   recording — pulsando vermelho, contador
 *   filled    — badge verde, ▶ ouvir, 🗑 deletar
 *
 * Exposto via window.GuitarSamplerComponent
 */
(function () {
    'use strict';

    // ── Definição da grade ────────────────────────────────────────
    const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    const QUALITIES = [
        { key: '',    label: 'Maior',  short: 'M'   },
        { key: 'm',   label: 'Menor',  short: 'm'   },
        { key: '7',   label: 'Dom 7',  short: '7'   },
        { key: 'm7',  label: 'Min 7',  short: 'm7'  },
        { key: 'dim', label: 'Dim',    short: '°'   },
    ];

    const INSTRUMENTS = [
        { key: 'guitar', label: 'Violão', icon: 'fa-guitar' },
        { key: 'cavaco', label: 'Cavaco', icon: 'fa-music'  },
    ];

    // ── Estado interno ────────────────────────────────────────────
    let _samples   = {};     // Map key: `${instrument}|${root}|${quality}` → sample row
    let _activeTab = 'guitar';
    let _recording = null;   // { root, quality, instrument } do slot em gravação

    // ── Helpers ───────────────────────────────────────────────────
    function slotKey(instrument, root, quality) {
        return `${instrument}|${root}|${quality}`;
    }

    function getSample(instrument, root, quality) {
        return _samples[slotKey(instrument, root, quality)] || null;
    }

    function setSample(instrument, root, quality, row) {
        _samples[slotKey(instrument, root, quality)] = row;
    }

    function removeSample(instrument, root, quality) {
        delete _samples[slotKey(instrument, root, quality)];
    }

    // ── Render principal ──────────────────────────────────────────
    const GuitarSamplerComponent = {

        render: async function () {
            const content = document.getElementById('main-content');
            content.innerHTML = `<div class="content-loader"><div class="loader-spinner"></div><p>Carregando samples…</p></div>`;

            // Busca samples existentes
            try {
                const rows = await window.HMSAPI.GuitarSamples.getAll();
                _samples = {};
                rows.forEach(r => setSample(r.instrument, r.chord_root, r.chord_quality, r));
            } catch (err) {
                console.warn('[GuitarSampler] Erro ao carregar samples:', err.message);
                _samples = {};
            }

            GuitarSamplerComponent._renderPage();
        },

        _renderPage: function () {
            const content = document.getElementById('main-content');

            const tabsHtml = INSTRUMENTS.map(ins => `
                <button class="gs-tab ${_activeTab === ins.key ? 'active' : ''}"
                        id="gs-tab-${ins.key}" data-instrument="${ins.key}">
                    <i class="fa-solid ${ins.icon}"></i> ${ins.label}
                </button>
            `).join('');

            content.innerHTML = `
                <div class="page-header">
                    <div class="page-title">
                        <div class="page-title-icon"><i class="fa-solid fa-microphone"></i></div>
                        <div>
                            <h2>Sampler de Acordes</h2>
                            <p>Grave samples reais para usar no player</p>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="gs-tabs">${tabsHtml}</div>

                <!-- Instrução -->
                <div id="gs-instruction" class="gs-instruction">
                    <i class="fa-solid fa-circle-info" style="color:var(--brand);margin-right:6px;"></i>
                    Toque o acorde no instrumento <strong>após</strong> clicar na célula — o início é detectado automaticamente.
                </div>

                <!-- Grid -->
                <div class="panel">
                    <div class="panel-body" style="padding:16px;overflow-x:auto;">
                        <div id="gs-grid-wrap"></div>
                    </div>
                </div>
            `;

            GuitarSamplerComponent._renderGrid();
            GuitarSamplerComponent._bindTabs();
        },

        _renderGrid: function () {
            const wrap = document.getElementById('gs-grid-wrap');
            if (!wrap) return;

            // Cabeçalho de raízes
            const headerCells = ROOTS.map(r =>
                `<div class="gs-header-cell">${r}</div>`
            ).join('');

            // Linhas por quality
            const rows = QUALITIES.map(q => {
                const cells = ROOTS.map(root => {
                    const sample = getSample(_activeTab, root, q.key);
                    return GuitarSamplerComponent._renderCell(root, q.key, sample);
                }).join('');
                return `
                    <div class="gs-row">
                        <div class="gs-quality-label" title="${q.label}">${q.short}</div>
                        ${cells}
                    </div>
                `;
            }).join('');

            wrap.innerHTML = `
                <div class="gs-grid">
                    <div class="gs-row">
                        <div class="gs-quality-label"></div>
                        ${headerCells}
                    </div>
                    ${rows}
                </div>
            `;

            // Bind de eventos nas células
            wrap.querySelectorAll('.gs-cell').forEach(cell => {
                const { root, quality, instrument } = cell.dataset;
                const sample = getSample(instrument, root, quality);

                if (!sample) {
                    // Célula vazia → clique inicia gravação
                    cell.addEventListener('click', () => {
                        GuitarSamplerComponent._startRecording(root, quality, instrument);
                    });
                } else {
                    // Botão play
                    cell.querySelector('.gs-btn-play')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        GuitarSamplerComponent._playSample(sample);
                    });
                    // Botão delete
                    cell.querySelector('.gs-btn-del')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        GuitarSamplerComponent._deleteSample(root, quality, instrument);
                    });
                }
            });

            // Célula em gravação
            if (_recording) {
                const { root, quality, instrument } = _recording;
                const key = `gs-cell-${instrument}-${root}-${quality}`;
                const cell = document.getElementById(key);
                if (cell) cell.classList.add('recording');
            }
        },

        _renderCell: function (root, quality, sample) {
            const instrument = _activeTab;
            const id = `gs-cell-${instrument}-${root}-${quality}`;
            const q = QUALITIES.find(q => q.key === quality) || QUALITIES[0];
            const chordName = `${root}${quality}`;
            const isRec = _recording && _recording.root === root
                       && _recording.quality === quality
                       && _recording.instrument === instrument;

            if (isRec) {
                return `
                    <div class="gs-cell recording" id="${id}"
                         data-root="${root}" data-quality="${quality}" data-instrument="${instrument}">
                        <div class="gs-cell-chord">${chordName}</div>
                        <div class="gs-cell-status">
                            <span class="gs-rec-dot"></span>
                            <span id="gs-countdown">…</span>
                        </div>
                        <div id="gs-level-bar" class="gs-level-bar"><div class="gs-level-fill" style="width:0%"></div></div>
                    </div>`;
            }

            if (sample) {
                const dur = sample.duration_ms ? `${(sample.duration_ms / 1000).toFixed(1)}s` : '';
                return `
                    <div class="gs-cell filled" id="${id}"
                         data-root="${root}" data-quality="${quality}" data-instrument="${instrument}">
                        <div class="gs-cell-chord">${chordName}</div>
                        <div class="gs-cell-dur">${dur}</div>
                        <div class="gs-cell-actions">
                            <button class="gs-btn-play" title="Ouvir"><i class="fa-solid fa-play"></i></button>
                            <button class="gs-btn-del"  title="Deletar"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>`;
            }

            return `
                <div class="gs-cell empty" id="${id}"
                     data-root="${root}" data-quality="${quality}" data-instrument="${instrument}"
                     title="Gravar ${chordName}">
                    <div class="gs-cell-chord">${chordName}</div>
                    <div class="gs-cell-add"><i class="fa-solid fa-circle-plus"></i></div>
                </div>`;
        },

        _bindTabs: function () {
            document.querySelectorAll('.gs-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (_recording) {
                        window.HMSApp.showToast('Cancele a gravação atual antes de trocar de instrumento.', 'warning');
                        return;
                    }
                    _activeTab = btn.dataset.instrument;
                    document.querySelectorAll('.gs-tab').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    GuitarSamplerComponent._renderGrid();
                });
            });
        },

        // ── Gravação ──────────────────────────────────────────────
        _startRecording: async function (root, quality, instrument) {
            if (_recording) {
                window.HMSApp.showToast('Já existe uma gravação em andamento.', 'warning');
                return;
            }
            if (!navigator.mediaDevices?.getUserMedia) {
                window.HMSApp.showToast('Seu navegador não suporta acesso ao microfone.', 'error');
                return;
            }

            _recording = { root, quality, instrument };
            GuitarSamplerComponent._renderGrid();

            const MAX_MS = 6000;

            try {
                const result = await window.GuitarRecorder.start({
                    onWaiting: (level) => {
                        // Atualiza barra de nível enquanto espera onset
                        const fill = document.querySelector('.gs-level-fill');
                        if (fill) fill.style.width = Math.min(level / 0.1 * 100, 100) + '%';
                        const cd = document.getElementById('gs-countdown');
                        if (cd) cd.textContent = '🎸 Toque!';
                    },
                    onRecording: () => {
                        const cd = document.getElementById('gs-countdown');
                        if (cd) cd.textContent = '● REC';
                    },
                    onProgress: ({ elapsed, total }) => {
                        const pct = Math.min(elapsed / total * 100, 100);
                        const fill = document.querySelector('.gs-level-fill');
                        if (fill) fill.style.width = pct + '%';
                        const cd = document.getElementById('gs-countdown');
                        const remaining = Math.max(0, Math.ceil((total - elapsed) / 1000));
                        if (cd) cd.textContent = `● ${remaining}s`;
                    },
                });

                // Salva no Supabase
                window.HMSApp.showToast('Processando…', 'info');
                const row = await window.HMSAPI.GuitarSamples.upload(
                    result.blob, root, quality, instrument, result.durationMs
                );
                setSample(instrument, root, quality, row);

                // Notifica AudioEngine
                if (window.HMSAudio?.addGuitarSample) {
                    const url = window.HMSAPI.GuitarSamples.getPublicUrl(row.storage_path);
                    window.HMSAudio.addGuitarSample(`${root}${quality}`, instrument, url);
                }

                window.HMSApp.showToast(`${root}${quality} gravado! (${(result.durationMs / 1000).toFixed(1)}s)`, 'success');

            } catch (err) {
                if (err.message === 'cancelled') {
                    window.HMSApp.showToast('Gravação cancelada.', 'info');
                } else if (err.message === 'timeout') {
                    window.HMSApp.showToast('Nenhum som detectado — tente novamente.', 'warning');
                } else {
                    console.error('[GuitarSampler] Erro:', err);
                    window.HMSApp.showToast('Erro na gravação: ' + err.message, 'error');
                }
            } finally {
                _recording = null;
                GuitarSamplerComponent._renderGrid();
            }
        },

        // ── Playback ──────────────────────────────────────────────
        _playSample: function (sample) {
            const url = window.HMSAPI.GuitarSamples.getPublicUrl(sample.storage_path);
            if (!url) { window.HMSApp.showToast('URL do sample não encontrada.', 'error'); return; }

            const audio = new Audio(url);
            audio.play().catch(err => {
                window.HMSApp.showToast('Erro ao reproduzir: ' + err.message, 'error');
            });
        },

        // ── Deleção ───────────────────────────────────────────────
        _deleteSample: async function (root, quality, instrument) {
            if (!confirm(`Deletar sample de ${root}${quality} (${instrument})?`)) return;
            try {
                await window.HMSAPI.GuitarSamples.remove(root, quality, instrument);
                removeSample(instrument, root, quality);

                if (window.HMSAudio?.removeGuitarSample) {
                    window.HMSAudio.removeGuitarSample(`${root}${quality}`, instrument);
                }

                window.HMSApp.showToast(`${root}${quality} deletado.`, 'success');
                GuitarSamplerComponent._renderGrid();
            } catch (err) {
                window.HMSApp.showToast('Erro ao deletar: ' + err.message, 'error');
            }
        },
    };

    window.GuitarSamplerComponent = GuitarSamplerComponent;
    console.info('[HMS] GuitarSamplerComponent loaded.');
})();
